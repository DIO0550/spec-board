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

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, RecvError};

use serde_json::json;

use crate::task_index::{normalized_task_file_path, task_from_markdown, TaskParseContext};
use spec_board_fs::file_scanner::task_md_relative_path;
use spec_board_fs::watcher::FsEvent;

use super::AdapterContext;

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
    match event {
        FsEvent::Created(p) | FsEvent::Modified(p) => handle_upsert(p, ctx, UpsertMode::Auto),
        FsEvent::Renamed { from, to } => {
            handle_delete(from, ctx)?;
            handle_upsert(to, ctx, UpsertMode::ForceCreated)
        }
        FsEvent::Removed(_) => {
            // 別 Issue で対応する。本ハンドラでは何もしない。
            log::trace!("watcher_event: ignoring Removed event");
            Ok(())
        }
        FsEvent::Other(p) => {
            log::trace!("watcher_event: ignoring Other event for {}", p.display());
            Ok(())
        }
        FsEvent::Rescan => {
            log::warn!("watcher_event: Rescan received; FE notification not yet wired");
            Ok(())
        }
        FsEvent::Error(msg) => {
            log::warn!("watcher_event: backend error: {msg}");
            Ok(())
        }
    }
}

/// 与えられた絶対パスが `open_project` のスキャン仕様に合う **タスク `.md`**
/// であれば、Task payload 用の正規化済み相対パスを返す。それ以外（root 外 /
/// `.md` 以外 / ドット始まり / `node_modules` 配下 / サイズ超過 / バイナリ等）
/// は `None` を返す。
///
/// 判定ロジックは `spec_board_fs::file_scanner::task_md_relative_path` を経由
/// することで `scan_md_files` と完全に揃える。これにより初回 scan で読まれない
/// ファイルが watcher 経由で `task-created` されたり、初回 scan で読まれた
/// `.MD` の変更が watcher で無視されたりすることを防ぐ。
///
/// `Removed` 系のイベントなど **既に削除された path** に対しては metadata
/// 取得が失敗するため `None` が返る。`handle_delete` は cache に存在するか
/// だけで動作するため、本関数の戻り値が `None` でも cache 上の rename / delete
/// 処理を阻害しないよう、呼び出し側は **rel_md_path_lenient** を併用する。
fn rel_md_path(abs_path: &Path, root: &Path) -> Option<String> {
    task_md_relative_path(abs_path, root).map(|rel| normalized_task_file_path(&rel))
}

/// `rel_md_path` と異なり **ファイル内容や metadata に依存しない** 軽量チェック。
/// `Renamed` の `from` 側のように既にファイルが存在しない（または別ファイルに
/// 置き換わっている）場合でも、cache 上の delete 判定だけは行えるようにする。
///
/// チェック対象: root 相対であること / `.md`（大小文字非区別）/ root 配下の
/// path component に `.` 始まり / `node_modules` を含まないこと / UTF-8 表現可能。
fn rel_md_path_lenient(abs_path: &Path, root: &Path) -> Option<String> {
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

/// write_ignore registry を consume し、自己書き込みなら `true` を返して
/// 呼び出し側に skip させる。
fn try_consume_write_ignore(ctx: &AdapterContext, abs_path: &Path) -> Result<bool, HandleError> {
    Ok(ctx.state.write_ignore().consume(abs_path)?)
}

fn handle_upsert(
    abs_path: &Path,
    ctx: &AdapterContext,
    mode: UpsertMode,
) -> Result<(), HandleError> {
    let Some(rel_str) = rel_md_path(abs_path, &ctx.root) else {
        log::trace!(
            "watcher_event: skipping non-md or out-of-root path: {}",
            abs_path.display()
        );
        return Ok(());
    };
    if try_consume_write_ignore(ctx, abs_path)? {
        return Ok(());
    }
    let bytes = match fs::read(abs_path) {
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
        file_path: PathBuf::from(rel_str.as_str()),
        default_status: ctx.default_status.clone(),
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
    let event_name = ctx.state.with_tasks_cache_mut(|cache| {
        let event = match mode {
            UpsertMode::Auto if cache.contains_key(&cache_key) => "task-updated",
            UpsertMode::Auto => "task-created",
            UpsertMode::ForceCreated => "task-created",
        };
        cache.insert(cache_key, task.clone());
        event
    })?;
    (ctx.emit)(event_name, json!({ "task": task }));
    Ok(())
}

/// 削除系（Rename の `from` 側）。`tasks_cache` から実際に entry を remove
/// できた場合のみ `task-deleted` を emit する。エディタの atomic save 時に
/// 出る一時ファイル rename で偽 delete が飛ばないようにするための運用。
///
/// from 側のファイルは既に削除済み（metadata 取得不可）なケースが多いため、
/// metadata に依存しない `rel_md_path_lenient` を使う。
fn handle_delete(abs_path: &Path, ctx: &AdapterContext) -> Result<(), HandleError> {
    let Some(rel_str) = rel_md_path_lenient(abs_path, &ctx.root) else {
        return Ok(());
    };
    if try_consume_write_ignore(ctx, abs_path)? {
        return Ok(());
    }
    let cache_key = PathBuf::from(rel_str.as_str());
    let removed = ctx
        .state
        .with_tasks_cache_mut(|cache| cache.remove(&cache_key).is_some())?;
    if removed {
        (ctx.emit)("task-deleted", json!({ "filePath": rel_str }));
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
    WriteIgnore(#[from] spec_board_fs::write_ignore::WriteIgnoreError),
}
