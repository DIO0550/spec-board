//! 1 件の `FsEvent` をパース・分類して `tasks_cache` の差分更新と emit を行う
//! 純粋ハンドラ。adapter スレッド本体（`run_event_loop`）はこれを recv ループ
//! で呼ぶだけの薄いシェル。
//!
//! emit は closure (`EmitFn`) として外から差し込むため、tauri 実装に依存せず
//! テストで Vec push スタブに置き換えられる。
//!
//! 本モジュールが触る AppState フィールドは `tasks_cache` と
//! `write_ignore` のみ。`watcher_handle` は触らない（`stop()` 中の deadlock
//! を防ぐ）。
//!
//! 拡張子フィルタ: `rel_md_path` で root 配下の `.md` ファイルだけを処理対象
//! とする。`.spec-board/config.json` や一時ファイル等は早期 return。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvError};

use crate::config::column_name::ColumnName;
use crate::state::tasks_revision::TasksRevision;
use crate::task::parse::default_status_for;
use crate::task::parse::{normalized_task_file_path, task_from_markdown, TaskParseContext};
use crate::task::rebuild::rebuild_tasks_from_disk;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use crate::task::warning::has_parent_cycle_warning;
use spec_board_fs::task::file_scanner::task_md_relative_path;
use spec_board_fs::watcher::core::{FsEvent, WatcherFailure, WatcherFailureKind};

use super::envelope::{
    build_envelope, DiagnosticCode, DiagnosticPayload, EnvelopePayload, ResyncReason,
    ResyncRequiredPayload, TaskDeletedPayload, TaskUpsertPayload, EVENT_DIAGNOSTIC,
    EVENT_RESYNC_REQUIRED, EVENT_TASK_CREATED, EVENT_TASK_DELETED, EVENT_TASK_UPDATED,
};
use super::AdapterContext;

/// full rescan の check-and-set 再試行上限。
///
/// 走査中に mutation command や `update_columns` が commit すると走査結果が古く
/// なるため再走査するが、連続 commit で無限に回らないよう上限を設ける。
/// **超過時は cache を変更せず `rescanFailed` を通知する**。最終試行だけ無条件
/// 採用にすると、その走査中のカラム変更まで誤った内容で確定させてしまうため、
/// 収束より正しさを優先する。
const RESCAN_MAX_ATTEMPTS: u32 = 3;

/// adapter スレッド本体。`Receiver<FsEvent>` を blocking で消費し、
/// Disconnected で抜ける。
pub(crate) fn run_event_loop(rx: Receiver<FsEvent>, ctx: AdapterContext) {
    loop {
        match rx.recv() {
            Ok(event) => {
                if let Err(err) = handle_event(&event, &ctx) {
                    log::warn!("watcher_event handler error: {err}");
                }
            }
            Err(RecvError) => {
                log::trace!("watcher_event channel disconnected; adapter stopping");
                return;
            }
        }
    }
}

/// `handle_upsert` が emit する event 名の決定方法。
#[derive(Debug, Clone, Copy)]
enum UpsertMode {
    /// cache 存在で `task-updated` / `task-created` を自動切替する通常モード。
    /// `Created` / `Modified` 単独イベントで使う（atomic save 互換）。
    Auto,
    /// 常に `task-created` を emit する。`Renamed { from, to }` の `to` 側で使う。
    /// rename を「旧 path delete + 新 path create」として仕様化しているため、
    /// `to` が既に cache にあっても `task-updated` ではなく `task-created` を出す。
    ForceCreated,
}

/// 1 件の FsEvent を処理する純粋ハンドラ。
///
/// emit / state は ctx 経由で受け取り、本関数は副作用と
/// `AppState::tasks_cache` の差分更新だけを行う。
pub(crate) fn handle_event(event: &FsEvent, ctx: &AdapterContext) -> Result<(), HandleError> {
    // 旧世代の adapter は cache も触らず emit もしない。通常は
    // `EmittingWatcherHandle::stop()` が commit より前に join 済みなので到達
    // しないが、二重防御としてここで確実に落とす。
    if ctx.generation != ctx.state.project_generation() {
        log::trace!("watcher_event: dropping event from stale watcher generation");
        return Ok(());
    }
    match event {
        FsEvent::Created(p) | FsEvent::Modified(p) => handle_upsert(p, ctx, UpsertMode::Auto),
        FsEvent::Renamed { from, to } => {
            handle_delete(from, ctx)?;
            handle_upsert(to, ctx, UpsertMode::ForceCreated)
        }
        FsEvent::Removed(p) => handle_delete(p, ctx),
        FsEvent::Other(p) => {
            log::trace!("watcher_event: ignoring Other event for {}", p.display());
            Ok(())
        }
        FsEvent::Rescan => handle_rescan(ctx),
        FsEvent::Error(failure) => handle_backend_failure(failure, ctx),
    }
}

/// 与えられた絶対パスが `open_project` のスキャン仕様に合う **タスク `.md`**
/// であれば、Task payload 用の正規化済み相対パスを返す。それ以外（root 外 /
/// `.md` 以外 / ドット始まり / `node_modules` 配下 / サイズ超過 / バイナリ等）
/// は `None` を返す。
///
/// 判定ロジックは `spec_board_fs::task::file_scanner::task_md_relative_path` を経由
/// することで `scan_md_files` と完全に揃える。これにより初回 scan で読まれない
/// ファイルが watcher 経由で `task-created` されたり、初回 scan で読まれた
/// `.MD` の変更が watcher で無視されたりすることを防ぐ。
///
/// `Removed` 系のイベントなど **既に削除された path** に対しては metadata
/// 取得が失敗するため `None` が返る。`handle_delete` は cache に存在するか
/// だけで動作するため、本関数の戻り値が `None` でも cache 上の rename / delete
/// 処理を阻害しないよう、呼び出し側は **rel_md_path_lenient** を併用する。
fn rel_md_path(abs_path: &Path, root: &Path) -> Option<TaskFilePath> {
    task_md_relative_path(abs_path, root).map(|rel| normalized_task_file_path(&rel))
}

/// `rel_md_path` と異なり **ファイル内容や metadata に依存しない** 軽量チェック。
/// `Renamed` の `from` 側のように既にファイルが存在しない（または別ファイルに
/// 置き換わっている）場合でも、cache 上の delete 判定だけは行えるようにする。
///
/// チェック対象: root 相対であること / `.md`（大小文字非区別）/ root 配下の
/// path component に `.` 始まり / `node_modules` を含まないこと / UTF-8 表現可能。
fn rel_md_path_lenient(abs_path: &Path, root: &Path) -> Option<TaskFilePath> {
    let rel = abs_path.strip_prefix(root).ok()?;
    if rel.as_os_str().is_empty() {
        return None;
    }
    if abs_path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| !s.eq_ignore_ascii_case("md"))
        .unwrap_or(true)
    {
        return None;
    }
    for component in rel.iter() {
        let name = component.to_str()?;
        if name.starts_with('.') || name == "node_modules" {
            return None;
        }
    }
    rel.to_str()?;
    Some(normalized_task_file_path(rel))
}

/// write_ignore registry から該当 path を取り除き、自己書き込みなら `true` を
/// 返して呼び出し側に skip させる。
fn try_consume_write_ignore(ctx: &AdapterContext, abs_path: &Path) -> Result<bool, HandleError> {
    Ok(ctx.state.write_ignore().unregister(abs_path)?)
}

fn handle_upsert(
    abs_path: &Path,
    ctx: &AdapterContext,
    mode: UpsertMode,
) -> Result<(), HandleError> {
    let Some(rel_path) = rel_md_path(abs_path, &ctx.root) else {
        // task_md_relative_path はプロジェクト規約に合わない path を一括で
        // フィルタする。具体的なフィルタ条件は file_scanner 側のドキュメント
        // を参照（root 外 / 非 .md / dotfile / node_modules / size 超 / バイナリ
        // / symlink / 非 UTF-8 のいずれか）。本層では理由の内訳を分離せず
        // 「scanner と同じ条件で除外した」とまとめて記録する。
        log::trace!(
            "watcher_event: skipping path not eligible as task .md (scanner filter excluded): {}",
            abs_path.display()
        );
        return Ok(());
    };
    if try_consume_write_ignore(ctx, abs_path)? {
        return Ok(());
    }
    let bytes = match ctx.io.read(abs_path) {
        Ok(b) => b,
        Err(err) => {
            log::warn!(
                "watcher_event: failed to read `{}`: {err}",
                abs_path.display()
            );
            return Ok(());
        }
    };
    let context = TaskParseContext {
        // rescan と同じく現在の config から解決する。spawn 時の値を使い続けると、
        // rescan で復旧した status 欠損 md が後続の Modified で古い既定へ戻る。
        file_path: rel_path.as_path_buf(),
        default_status: current_default_status(ctx)?,
    };
    let task = match task_from_markdown(&bytes, &context) {
        Ok(t) => t,
        Err(err) => {
            log::warn!(
                "watcher_event: failed to parse `{}`: {err}",
                abs_path.display()
            );
            return Ok(());
        }
    };
    let cache_key = PathBuf::from(task.file_path.as_str());
    let ((event_name, emitted_task), revision) =
        ctx.state.with_tasks_cache_mut_revision(|cache| {
            let event = match mode {
                UpsertMode::Auto if cache.contains_key(&cache_key) => EVENT_TASK_UPDATED,
                UpsertMode::Auto => EVENT_TASK_CREATED,
                UpsertMode::ForceCreated => EVENT_TASK_CREATED,
            };
            // 直前まで cycle member として正規化されていた task は、disk 由来の raw
            // `parent:` で warning とバナーを失わせないよう、parent=None と
            // parentCycle warning を引き継ぐ。
            // ただし新しい parsed task の parent が None の場合は、ユーザーが外部編集で
            // 親参照を消して循環を解消したとみなし、preserve せず disk の状態をそのまま
            // 反映する。新規 cycle の検出はフル再 scan に委ねる。
            let was_cycle_member = cache
                .get(&cache_key)
                .map(|prev| has_parent_cycle_warning(&prev.warnings))
                .unwrap_or(false);
            let mut next = task;
            next.preserve_parent_cycle_state(was_cycle_member, true);
            cache.insert(cache_key, next.clone());
            (event, next)
        })?;
    emit_envelope(
        ctx,
        event_name,
        revision,
        TaskUpsertPayload { task: emitted_task },
    );
    Ok(())
}

/// `FsEvent::Rescan` の authoritative な処理。
///
/// 1. 走査前の revision を控える
/// 2. **lock 外**で disk を再走査して `Task` 一覧を再構築する
/// 3. `replace_tasks_cache_if_unchanged` で **check-and-set** 置換する。revision と
///    「走査に使った既定 status」の両方を検証し、不一致（走査中に mutation command や
///    `update_columns` が commit した）なら 1 へ戻る
/// 4. `write_ignore` を clear する（stale entry が以後の自前 write 判定を誤らせる
///    のを防ぐ。`open_project` の commit と同じ扱い）
/// 5. snapshot を同梱せず「再取得せよ」という軽量 event を emit する
///
/// # check-and-set が守っているもの
///
/// 走査中に commit された mutation の結果は走査結果に含まれないため、そのまま
/// 置換すると cache から一時的に消える。ただし**恒久消失にはならない**:
/// `write_ignore` を clear するので、その自前 write 由来の FS event はもはや
/// 抑止されず、single consumer の `Receiver` に滞留していた分が rescan 後に
/// upsert として処理されて task は戻る。CAS が縮めているのは
/// **「一時的欠落 → 補償イベント到着までの窓」**であって、消失そのものではない。
///
/// 走査中に届いた FS 変更が失われないのも同じ理由（`run_event_loop` は single
/// consumer の blocking recv ループなのでキューに滞留するだけ）。それらは
/// 再構築後の cache に、rescan より大きい revision で適用される。
///
/// # 再試行上限を超えた場合
///
/// **cache は変更せず** `rescanFailed` の diagnostic を出す。最終試行だけ無条件
/// 置換にすると、その走査中に `update_columns` が commit した場合に**古い既定
/// status で status 欠損 md を確定させてしまう**。停滞（可視の通知あり）より
/// 誤った内容の確定の方が有害なため、収束を優先しない。
///
/// なお上限超過は実質起こらない: 並行 mutator は mutation 系 command のみで、
/// いずれもユーザー操作起点の単発である（自動的に連続 commit する経路が無い）。
///
/// # 再構築そのものに失敗した場合
///
/// cache を一切変更せず、`rescanFailed` の diagnostic のみを emit する。
/// FE に再取得させても BE の cache が古いままなので、「復旧できなかった」ことを
/// 伝える方が安全側。
fn handle_rescan(ctx: &AdapterContext) -> Result<(), HandleError> {
    let mut attempt = 1;
    let revision = loop {
        let expected = ctx.state.tasks_revision();
        // default status は spawn 時に焼き込んだ値ではなく **現在の config** から
        // 解決する。`update_columns` で先頭カラムが変わったあとに rescan すると、
        // status 欠損 md の既定値が project を開き直した場合と食い違うため。
        // CAS 不一致で再走査する場合も config が変わっている可能性があるので、
        // 試行ごとに解決し直す。
        let default_status = current_default_status(ctx)?;
        let tasks = match rebuild_tasks_from_disk(&ctx.root, &default_status, ctx.io.as_ref()) {
            Ok(tasks) => tasks,
            Err(err) => {
                log::warn!("watcher_event: full rescan failed: {err}");
                emit_diagnostic(
                    ctx,
                    DiagnosticCode::RescanFailed,
                    &err.to_string(),
                    Vec::new(),
                );
                return Ok(());
            }
        };
        let cache: HashMap<PathBuf, Task> = tasks
            .into_iter()
            .map(|task| (PathBuf::from(task.file_path.as_str()), task))
            .collect();
        // revision だけでなく「走査に使った既定 status」も検証する。`update_columns`
        // は config 差し替えと cache 更新が別区間なので、config だけ新しく revision は
        // 古いままの瞬間があり、revision だけ見ると status 欠損 md を旧カラムへ
        // 確定させてしまう。**最終試行も無条件置換にはしない**（無条件だと最後の
        // 走査中の config 変更をそのまま確定させてしまうため）。
        if let Some(revision) =
            ctx.state
                .replace_tasks_cache_if_unchanged(expected, &default_status, cache)?
        {
            break revision;
        }
        if attempt >= RESCAN_MAX_ATTEMPTS {
            log::warn!("watcher_event: full rescan gave up after {attempt} attempts");
            emit_diagnostic(
                ctx,
                DiagnosticCode::RescanFailed,
                "再スキャン中に状態が変化し続けたため復旧できませんでした",
                Vec::new(),
            );
            return Ok(());
        }
        attempt += 1;
    };
    // clear の失敗で早期 return すると、cache は置換済みなのに再取得要求だけが
    // 届かず board が恒久的に stale になる。emit を先に確定させ、clear の失敗は
    // そのあとで呼び出し側へ伝える。
    let cleared = ctx.state.write_ignore().clear();
    emit_envelope(
        ctx,
        EVENT_RESYNC_REQUIRED,
        revision,
        ResyncRequiredPayload {
            reason: ResyncReason::Rescan,
        },
    );
    cleared?;
    Ok(())
}

/// 現在の `Config` から既定 status を解決する。config 未保持なら spawn 時の値。
fn current_default_status(ctx: &AdapterContext) -> Result<ColumnName, HandleError> {
    Ok(ctx
        .state
        .config()?
        .as_ref()
        .map(default_status_for)
        .unwrap_or_else(|| ctx.default_status.clone()))
}

/// backend 障害を structured diagnostics として FE へ通知する。
///
/// 監視が壊れても board は静かに古くなるだけで利用者には見えないため、log に
/// 落とさず必ず FE へ届ける。**状態は一切変更しない**。
fn handle_backend_failure(
    failure: &WatcherFailure,
    ctx: &AdapterContext,
) -> Result<(), HandleError> {
    log::warn!(
        "watcher_event: backend error ({:?}): {}",
        failure.kind,
        failure.detail
    );
    let paths = failure
        .paths
        .iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    emit_diagnostic(
        ctx,
        diagnostic_code_for(failure.kind),
        &failure.detail,
        paths,
    );
    Ok(())
}

fn diagnostic_code_for(kind: WatcherFailureKind) -> DiagnosticCode {
    match kind {
        WatcherFailureKind::WatchPathUnavailable => DiagnosticCode::WatchPathUnavailable,
        WatcherFailureKind::ResourceExhausted => DiagnosticCode::ResourceExhausted,
        WatcherFailureKind::PermissionDenied => DiagnosticCode::PermissionDenied,
        WatcherFailureKind::Io => DiagnosticCode::Io,
        WatcherFailureKind::Unknown => DiagnosticCode::Unknown,
    }
}

/// 診断 envelope を emit する。**state は一切変更しない**ため、現在の revision を
/// そのまま載せる（`cacheMutating` は payload 型から `false` が導出される）。
fn emit_diagnostic(ctx: &AdapterContext, code: DiagnosticCode, message: &str, paths: Vec<String>) {
    emit_envelope(
        ctx,
        EVENT_DIAGNOSTIC,
        ctx.state.tasks_revision(),
        DiagnosticPayload {
            code,
            message: message.to_string(),
            paths,
        },
    );
}

/// envelope を組み立てて emit する共通ヘルパ。
///
/// `cache_mutating` は `P::CACHE_MUTATING` から導出するため引数に取らない
/// （呼び出し側が誤った値を渡す余地を無くす）。
///
/// `eventSeq` は emit の**直前**に消費する。`(ctx.emit)` の内部で
/// `AppHandle::emit` が失敗しても番号は戻さない。欠番は FE の gap 検知に
/// 拾われ、自動再取得で復旧する方に倒す。
fn emit_envelope<P: EnvelopePayload + serde::Serialize>(
    ctx: &AdapterContext,
    event_name: &str,
    revision: TasksRevision,
    payload: P,
) {
    let envelope = build_envelope(
        &ctx.project_key,
        ctx.generation,
        revision,
        ctx.state.next_event_seq(),
        payload,
    );
    match serde_json::to_value(&envelope) {
        Ok(value) => (ctx.emit)(event_name, value),
        Err(err) => log::warn!("watcher_event: failed to serialize `{event_name}` envelope: {err}"),
    }
}

/// 削除系（Rename の `from` 側 / 単独 Remove イベント）。`tasks_cache` から
/// 実際に entry を remove できた場合のみ `task-deleted` を emit する。
/// エディタの atomic save 時に出る一時ファイル rename / 削除で偽 delete が
/// 飛ばないようにするための運用。
///
/// 対象ファイルは既に削除済み（metadata 取得不可）なケースが多いため、
/// metadata に依存しない `rel_md_path_lenient` を使う。
fn handle_delete(abs_path: &Path, ctx: &AdapterContext) -> Result<(), HandleError> {
    let Some(rel_path) = rel_md_path_lenient(abs_path, &ctx.root) else {
        return Ok(());
    };
    if try_consume_write_ignore(ctx, abs_path)? {
        return Ok(());
    }
    let cache_key = rel_path.as_path_buf();
    let (removed, revision) = ctx
        .state
        .with_tasks_cache_mut_revision(|cache| cache.remove(&cache_key).is_some())?;
    if removed {
        emit_envelope(
            ctx,
            EVENT_TASK_DELETED,
            revision,
            TaskDeletedPayload {
                file_path: rel_path.as_str().to_string(),
            },
        );
    } else {
        log::trace!(
            "watcher_event: ignoring delete for path not in cache: {}",
            abs_path.display()
        );
    }
    Ok(())
}

/// `handle_event` 内で発生し得るエラー。adapter ループ側では `log::warn!` で
/// 記録するだけで loop を継続する。
#[derive(Debug, thiserror::Error)]
pub(crate) enum HandleError {
    #[error("AppState lock poisoned: {0}")]
    StateLock(#[from] crate::state::AppStateError),
    #[error("WriteIgnore lock poisoned: {0}")]
    WriteIgnore(#[from] spec_board_fs::watcher::write_ignore::WriteIgnoreError),
}

#[cfg(test)]
#[path = "handler_tests.rs"]
mod handler_tests;
