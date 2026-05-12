//! `create_task` Tauri command の引数受け取り型・入力検証純粋関数群と effect 層。
//!
//! 本モジュールは以下を提供する:
//! - [`CreateTaskArgs`][] : FE から受け取る引数 DTO
//! - [`CreateTaskError`][]: 入力検証エラー
//! - [`build_new_filename`][]: title と既存ファイル名集合からユニークな
//!   md ファイル名を生成する純粋関数
//! - [`validate_parent_for_new_task`][]: 新規タスクの parent 引数を既存タスク
//!   スナップショットに対して検証する純粋関数（存在 + 循環/深さ）
//! - [`create_task`][] / [`create_task_impl`][]: Tauri command 薄層 + effect 層実装

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Deserialize;
use spec_board_fs::task::kebab_case::to_kebab_case;
use spec_board_fs::task::unique_filename::build_unique_filename;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;
use tauri::State;
use thiserror::Error;

use super::frontmatter::{
    parse as parse_frontmatter, serialize as serialize_frontmatter, Frontmatter, FrontmatterError,
    Parsed, Priority,
};
use super::index::{
    resolve_parent_for_new_task, task_from_parsed, validate_chain_from_parent,
    validate_parent_hierarchy, ParentHierarchyErrorReason, Task, TaskExtras, TaskIndex,
    TaskParseContext, TaskParseError, TaskWarning,
};
use super::task_file_path::TaskFilePath;
use super::task_title::TaskTitle;
use crate::config::column_name::ColumnName;
use crate::state::{AppState, AppStateError};

/// `create_task` Tauri command の引数 DTO。
///
/// FE 側 invoke の camelCase キーと整合させるため
/// `#[serde(rename_all = "camelCase")]` を付与する。
/// `priority` は本Issue では文字列のまま保持し、値域検証は後続Issue で行う。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskArgs {
    /// タスクタイトル（必須）。空文字列は [`CreateTaskError::InvalidTitle`] となる。
    pub title: String,
    /// ステータス文字列（必須）。値域検証は本Issue では行わない。
    pub status: String,
    /// 優先度文字列。`"High" | "Medium" | "Low"` 想定だが本Issue では検証しない。
    pub priority: Option<String>,
    /// ラベル一覧。未指定時は空配列。
    #[serde(default)]
    pub labels: Vec<String>,
    /// 親タスクへのプロジェクトルート相対パス（例: `tasks/parent-task.md`）。
    /// `.md` 拡張子込みのパス文字列で受け取る前提
    /// （task-format-spec.md の `parent` フィールド仕様に準拠）。
    /// 存在 + 循環/深さの検証は [`validate_parent_for_new_task`] で行う。
    pub parent: Option<String>,
    /// 本文（Markdown）。未指定時は空文字列扱い。
    pub body: Option<String>,
}

/// `create_task` の入力検証エラー。
///
/// FE 側 `TauriError.PATTERNS` に意図的に引っかからない Display 文字列を採用し、
/// FE では UNKNOWN 分類となる前提（後続Issue で必要なら PATTERNS を整備）。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum CreateTaskError {
    /// `title` が空、または `to_kebab_case(title)` の結果が空文字列となるケース。
    #[error("タイトルからファイル名を生成できません")]
    InvalidTitle,
    /// `parent` で指定されたパスが既存タスクと一致しない。
    /// 空文字 / 絶対パス / Windows drive prefix / 自己参照（新規タスクは未登録のため
    /// 自然にここに該当） / 単純な不一致 をすべて含む。
    #[error("親タスクが見つかりません: {parent}")]
    ParentNotFound { parent: String },
    /// `parent` 起点 chain に循環があるか、新規タスク 1 edge を加えた合計が
    /// 最大深さ（20）を超える。
    #[error("親タスクのチェーン検証に失敗しました ({parent}): {reason}")]
    ParentCycleOrTooDeep {
        parent: String,
        reason: ParentHierarchyErrorReason,
    },
    /// 生成 content が scanner の eligible 条件を満たさない（1 MiB 超 / 先頭 8 KB に
    /// NUL byte を含む）。書き込み後 reopen / 再 scan 時に scanner で除外されて
    /// state 不整合が起きるため、書込み前にこの段階で弾く。
    #[error("作成しようとしたタスク本文が scanner の対象外です: {reason}")]
    ContentNotScannerEligible { reason: ContentRejectReason },
}

/// `ContentNotScannerEligible` の理由バリアント。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentRejectReason {
    /// scanner の `MAX_FILE_SIZE` (1 MiB) を超える。
    TooLarge { size: u64 },
    /// scanner の `BINARY_PROBE_LEN` (8 KiB) 範囲に NUL byte が含まれる。
    BinaryDetected,
}

impl std::fmt::Display for ContentRejectReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::TooLarge { size } => {
                write!(f, "本文サイズが 1 MiB を超えています ({size} byte)")
            }
            Self::BinaryDetected => write!(f, "本文の先頭 8 KiB に NUL byte が含まれています"),
        }
    }
}

/// title と既存ファイル名集合から、衝突しない md ファイル名を生成する。
///
/// # 引数
/// - `title`: タスクタイトル。`to_kebab_case` で kebab-case 化される。
/// - `existing_filenames`: 衝突判定に使う既存ファイル名集合。本関数の戻り値と
///   同じ形式（拡張子 `.md` 込み・ディレクトリ部分なしのファイル名文字列。
///   例: `"foo.md"` / `"タスク-1.md"`）が格納されている前提。
///   **`Task.file_path` は `tasks/foo.md` のような相対パスで保持されるため、
///   呼び出し側でどの範囲（同一ディレクトリ・全タスク・root 直下のみ等）から
///   ファイル名部分のみを抜き出して集合を構築するかを決める責務がある。**
///
/// # 戻り値
/// - `Ok(String)`: 拡張子 `.md` 付きのユニークなファイル名（例: `"fix-login-bug.md"` /
///   衝突時 `"fix-login-bug-1.md"`）。
/// - `Err(CreateTaskError::InvalidTitle)`: `title` が空、または kebab-case 化結果が空のとき。
///
/// # 仕様委譲
/// - kebab-case 化のルールは `to_kebab_case` の仕様に委譲する。具体的には
///   ASCII 文字を 1 つでも含む入力では英数字以外の ASCII 文字（スペース・記号・
///   `_` ・ `.` ・ `/` 等）が `-` 区切りに集約され、連続ハイフンは 1 個に圧縮、
///   ASCII 大文字は小文字化される。一方 ASCII 文字を 1 つも含まない入力は
///   入力をそのまま返す。
/// - 上記により、ASCII 込み入力に `/` が含まれていても結果に残らないが、
///   ASCII を含まない入力に非 ASCII の禁止文字（例: 全角スラッシュ `／`）が
///   混じると素通りし得る。ファイル書込み直前のパス検証は呼び出し側の責務。
/// - 連番サフィックス（`-1`, `-2`, ...）の付与規則は `build_unique_filename` の仕様に委譲する。
pub fn build_new_filename(
    title: &str,
    existing_filenames: &HashSet<String>,
) -> Result<String, CreateTaskError> {
    let base = to_kebab_case(title);
    if base.is_empty() {
        return Err(CreateTaskError::InvalidTitle);
    }
    Ok(build_unique_filename(&base, "md", existing_filenames))
}

/// 新規タスクの `parent` 引数を検証する純粋関数。
///
/// 検証内容:
/// 1. `parent = None` の場合は親なしとして `Ok(())`。
/// 2. `parent = Some(path)` の場合、`existing_tasks` の `file_path` と一致するか
///    （`./` 接頭辞や `\\` セパレータの正規化込み）。一致しなければ
///    [`CreateTaskError::ParentNotFound`] を返す（空文字 / 絶対パス / Windows drive prefix /
///    自己参照もここに含まれる）。
/// 3. parent 起点 chain に新規タスク 1 edge を追加した合計深さが
///    最大深さ（20）を超えないか・循環していないかを検証する。違反した場合は
///    [`CreateTaskError::ParentCycleOrTooDeep`] を返す。
///
/// @param parent FE から受け取った parent 文字列（`None` または `tasks/foo.md` 形式）。
/// @param existing_tasks `AppState.tasks_cache` のスナップショット。
/// @returns Ok(()) / `ParentNotFound` / `ParentCycleOrTooDeep`。
pub fn validate_parent_for_new_task(
    parent: Option<&str>,
    existing_tasks: &[Task],
) -> Result<(), CreateTaskError> {
    let Some(parent_str) = parent else {
        return Ok(());
    };

    let parent_index =
        resolve_parent_for_new_task(parent_str, existing_tasks).ok_or_else(|| {
            CreateTaskError::ParentNotFound {
                parent: parent_str.to_string(),
            }
        })?;

    validate_chain_from_parent(parent_index, existing_tasks).map_err(|reason| {
        CreateTaskError::ParentCycleOrTooDeep {
            parent: parent_str.to_string(),
            reason,
        }
    })
}

/// `create_task` Tauri command 全体のエラー。
///
/// FE には `to_string()` で文字列化されて伝わる。
#[derive(Debug, Error)]
pub enum CreateTaskCommandError {
    /// 入力検証エラー（既存純粋関数経由）。
    #[error(transparent)]
    Validation(#[from] CreateTaskError),
    /// プロジェクト未 open（`AppState.project_path` が `None`）。
    #[error("project is not opened")]
    NoProjectOpen,
    /// `AppState` 内部 Mutex の lock 取得失敗。
    #[error("内部状態のロックが破損しました")]
    AppState(#[from] AppStateError),
    /// `WriteIgnoreRegistry` の lock 取得失敗等。
    #[error(transparent)]
    WriteIgnore(#[from] WriteIgnoreError),
    /// ファイル I/O 失敗（`create_dir_all` / `OpenOptions::open` / `write_all`）。
    #[error("failed to write task file: {0}")]
    Io(#[from] std::io::Error),
    /// 生成した frontmatter の再 parse 失敗（通常運用では発生しない）。
    #[error(transparent)]
    Frontmatter(#[from] FrontmatterError),
}

/// `create_task` Tauri command 薄層。
///
/// `create_task_impl` を呼び、エラーは Display 文字列化して FE へ返す。
#[tauri::command]
pub fn create_task(state: State<'_, Arc<AppState>>, args: CreateTaskArgs) -> Result<Task, String> {
    create_task_impl(state.inner(), args).map_err(|e| e.to_string())
}

/// `create_task` の effect 層本体（テスト境界）。
///
/// 全体フロー:
/// 1. preflight lock probe（tasks_cache + write_ignore）
/// 2. project_path / tasks_snapshot 取得
/// 3. parent 解決 + chain 検証
/// 4. 配置先 dir / filename / content の決定
/// 5. augmented hierarchy 検証（dangling parent 解決による cycle/too deep 防止）
/// 6. `create_dir_all` → `write_ignore.register`（watcher 起動時のみ）
///    → `OpenOptions::create_new(true).write(true)`
/// 7. cache 差分更新 (`TaskIndex::insert_new_task_into_cache`)
pub(crate) fn create_task_impl(
    state: &AppState,
    args: CreateTaskArgs,
) -> Result<Task, CreateTaskCommandError> {
    // 1. preflight (side effect 前の lock 健全性確認)
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    // 2. snapshot + project root
    let project_root = state
        .project_path()?
        .ok_or(CreateTaskCommandError::NoProjectOpen)?;
    let snapshot = state.tasks_snapshot()?;

    // 3. parent 解決 + chain 検証
    let parent_index = resolve_parent_and_validate(args.parent.as_deref(), &snapshot)?;

    // 4. 配置先ディレクトリ（raw 入力ではなく解決済み Task.file_path から導出）
    let target_dir = resolve_target_dir(parent_index, &snapshot);

    // 5. 同ディレクトリ内の既存ファイル名集合 → 衝突回避ファイル名
    let existing = build_existing_filenames_in_dir(&snapshot, &target_dir);
    let filename = build_new_filename(&args.title, &existing)?;

    // 6. relative / absolute path
    let rel_path = join_rel_path(&target_dir, &filename);
    let abs_path = project_root.join(&rel_path);
    let target_dir_abs = project_root.join(&target_dir);

    // 7. frontmatter + body 文字列を組み立て
    let resolved_parent_path = parent_index.map(|i| snapshot[i].file_path.as_str().to_string());
    let content = build_task_content(&args, resolved_parent_path.as_deref());

    // 7.5 生成 content が scanner の eligible 条件を満たすか検証する。
    //     `spec_board_fs::task::file_scanner` は 1 MiB 超や先頭 8 KiB に NUL byte を
    //     含むファイルを除外するため、create 直後は cache にあっても reopen 後に
    //     scanner で消える状態不整合が起きる。書込み前にこの段階で弾く。
    validate_content_scanner_eligibility(&content)?;

    // 8. augmented hierarchy 検証（FS write 前に dangling 解決 cycle / too deep を弾く）
    let provisional =
        build_provisional_task_for_validation(&rel_path, &args, resolved_parent_path.as_deref());
    validate_augmented_hierarchy(&snapshot, &provisional, args.parent.as_deref())?;

    // 9. watcher 起動有無を probe（state lock エラー時に FS 副作用を残さないため
    //    `create_dir_all` より前に行う）
    let watcher_active = state.is_watcher_installed()?;

    // 10. ディレクトリ確保（register 前なので失敗時 rollback 不要）
    std::fs::create_dir_all(&target_dir_abs)?;

    // 11. write_ignore 登録 → 排他 create write
    //     `open` で create_new=true により既存ファイル衝突を弾き、`write_all` で
    //     本文を書き込む。`write_all` が途中で失敗した場合のみ、本関数が作った
    //     ファイル（自前で確実に所有している）を `remove_file` で巻き戻す。
    //     open 自体の失敗時には本関数はファイルを作成していないため `remove_file`
    //     してはならない（race condition で他プロセスが作った同 path を消して
    //     しまう恐れがある）。
    if watcher_active {
        state.write_ignore().register(&abs_path)?;
    }
    let mut file = match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&abs_path)
    {
        Ok(f) => f,
        Err(err) => {
            if watcher_active {
                let _ = state.write_ignore().unregister(&abs_path);
            }
            return Err(CreateTaskCommandError::Io(err));
        }
    };
    if let Err(err) = std::io::Write::write_all(&mut file, content.as_bytes()) {
        drop(file);
        if let Err(rm_err) = std::fs::remove_file(&abs_path) {
            if rm_err.kind() != std::io::ErrorKind::NotFound {
                log::warn!(
                    "create_task: failed to clean up partial file `{}`: {rm_err}",
                    abs_path.display()
                );
            }
        }
        if watcher_active {
            let _ = state.write_ignore().unregister(&abs_path);
        }
        return Err(CreateTaskCommandError::Io(err));
    }
    drop(file);

    // 12-13. 書き込んだ md を再 parse → Task に変換 → cache 差分更新。
    //         ここで失敗（lock poison / parse 失敗）すると、cache には新規 Task が
    //         反映されないため、`write_ignore` を残したままだと watcher 経由でも
    //         拾えなくなる。したがって post-write phase の Err では
    //         `write_ignore.unregister` を呼んで watcher の自然回復経路に戻す
    //         （成功時はそのまま残し、watcher event を consume させる）。
    let result = parse_and_insert_into_cache(state, &content, &rel_path, args.status.clone());
    if result.is_err() && watcher_active {
        let _ = state.write_ignore().unregister(&abs_path);
    }
    result
}

/// FS write 成功後に呼ぶ post-write phase 本体。
///
/// 再 parse → Task 構築 → `tasks_cache` への差分挿入をまとめる。失敗時は
/// caller が `write_ignore.unregister` を行うことで、watcher の自然回復に
/// 委ねる前提（部分 atomic）。
fn parse_and_insert_into_cache(
    state: &AppState,
    content: &str,
    rel_path: &Path,
    status: String,
) -> Result<Task, CreateTaskCommandError> {
    let parsed = parse_frontmatter(content)?.expect("just-written frontmatter must parse");
    let ctx = TaskParseContext {
        file_path: rel_path.to_path_buf(),
        default_status: ColumnName::from_lenient(status),
    };
    let task = task_from_parsed(parsed, &ctx);
    let final_task =
        state.with_tasks_cache_mut(|cache| TaskIndex::insert_new_task_into_cache(cache, task))?;
    Ok(final_task)
}

/// parent 文字列を解決し、chain 検証まで実行する。
///
/// `None` の場合は `Ok(None)`（親なし）。`Some` の場合は既存 snapshot 内の index を返すか、
/// 既存純粋関数のエラーを `CreateTaskError` に詰め直す。
pub(crate) fn resolve_parent_and_validate(
    parent: Option<&str>,
    snapshot: &[Task],
) -> Result<Option<usize>, CreateTaskError> {
    let Some(parent_str) = parent else {
        return Ok(None);
    };
    let parent_index = resolve_parent_for_new_task(parent_str, snapshot).ok_or_else(|| {
        CreateTaskError::ParentNotFound {
            parent: parent_str.to_string(),
        }
    })?;
    validate_chain_from_parent(parent_index, snapshot).map_err(|reason| {
        CreateTaskError::ParentCycleOrTooDeep {
            parent: parent_str.to_string(),
            reason,
        }
    })?;
    Ok(Some(parent_index))
}

/// parent_index から配置先ディレクトリを決める。
///
/// 親未指定なら `tasks`、指定ありなら親 Task の `file_path` の dirname。
/// 親 Task が root 配下にある場合は空 `PathBuf`（=ルート直下）になる。
pub(crate) fn resolve_target_dir(parent_index: Option<usize>, snapshot: &[Task]) -> PathBuf {
    match parent_index {
        Some(i) => {
            let p = Path::new(snapshot[i].file_path.as_str());
            p.parent().map(Path::to_path_buf).unwrap_or_default()
        }
        None => PathBuf::from("tasks"),
    }
}

/// target_dir 直下に存在する Task のファイル名（basename）の集合を作る。
///
/// `Task.file_path` は forward slash 正規化済み相対パス前提。snapshot 内で
/// 同一 dirname の Task のみを拾い、basename のみを取り出して `HashSet` に詰める。
/// 比較は `Path::parent()` の `Path` 単位で行うため slash 表記揺れに耐性がある。
pub(crate) fn build_existing_filenames_in_dir(
    tasks: &[Task],
    target_dir: &Path,
) -> HashSet<String> {
    let mut out: HashSet<String> = HashSet::new();
    for task in tasks {
        let path = Path::new(task.file_path.as_str());
        let parent = path.parent().unwrap_or_else(|| Path::new(""));
        if parent != target_dir {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        out.insert(name.to_string());
    }
    out
}

/// frontmatter + body を md 文字列に組み立てる。
///
/// - title / status は `extras` に詰めて typed 位置（先頭）に出る
/// - priority は `Priority::from_ascii_ci` で正規化、`Some` のみ出力
/// - labels は空なら省略
/// - parent は解決済みの `Task.file_path` 文字列をそのまま入れる（未指定なら省略）
/// - body は `args.body` を本文として末尾に追加（前に空行 1 行を挟む）
pub(crate) fn build_task_content(
    args: &CreateTaskArgs,
    resolved_parent_path: Option<&str>,
) -> String {
    use serde_yaml_ng::{Mapping, Value};

    let mut extras = Mapping::new();
    extras.insert(
        Value::String("title".into()),
        Value::String(args.title.clone()),
    );
    extras.insert(
        Value::String("status".into()),
        Value::String(args.status.clone()),
    );
    if let Some(parent_path) = resolved_parent_path {
        extras.insert(
            Value::String("parent".into()),
            Value::String(parent_path.to_string()),
        );
    }

    let priority = args.priority.as_deref().and_then(Priority::from_ascii_ci);

    let frontmatter = Frontmatter {
        priority,
        labels: args.labels.clone(),
        links: Vec::new(),
        extras,
    };

    let body = match args.body.as_deref() {
        Some(b) if !b.is_empty() => format!("\n{b}"),
        _ => String::new(),
    };

    serialize_frontmatter(&Parsed { frontmatter, body })
}

/// hierarchy 検証用に最低限のフィールドだけ埋めた Task を作る。
fn build_provisional_task_for_validation(
    rel_path: &Path,
    args: &CreateTaskArgs,
    resolved_parent_path: Option<&str>,
) -> Task {
    let file_path = TaskFilePath::from_lenient(rel_path.to_string_lossy().replace('\\', "/"));
    let parent = resolved_parent_path.map(TaskFilePath::from_lenient);
    Task {
        id: file_path.clone(),
        file_path,
        title: TaskTitle::from_lenient(args.title.clone()),
        status: ColumnName::from_lenient(args.status.clone()),
        priority: None,
        labels: Vec::new(),
        parent,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: TaskExtras::new(),
        warnings: Vec::<TaskWarning>::new(),
    }
}

/// snapshot に provisional な new_task を足した状態で parent chain を一括検証し、
/// dangling parent 解決による cycle / too deep を検出する。
///
/// 既存 snapshot は open_project 時点で検証済みなので、新規発生し得る違反は
/// new_task の挿入で初めて成立するもののみ。`TaskParseError::CycleOrTooDeep` を
/// `CreateTaskError::ParentCycleOrTooDeep` にマップして返す。
fn validate_augmented_hierarchy(
    snapshot: &[Task],
    new_task: &Task,
    raw_parent_input: Option<&str>,
) -> Result<(), CreateTaskError> {
    let mut augmented: Vec<Task> = snapshot.to_vec();
    augmented.push(new_task.clone());
    match validate_parent_hierarchy(augmented) {
        Ok(_) => Ok(()),
        Err(TaskParseError::CycleOrTooDeep { reason, .. }) => {
            Err(CreateTaskError::ParentCycleOrTooDeep {
                parent: raw_parent_input.unwrap_or("").to_string(),
                reason,
            })
        }
        Err(other) => {
            // build_children 経由ではない経路で他 variant が来た場合は伝播理由
            // を `Cycle` 相当に詰め直す（通常運用では到達しない）。
            log::warn!("validate_augmented_hierarchy: unexpected error: {other}");
            Err(CreateTaskError::ParentCycleOrTooDeep {
                parent: raw_parent_input.unwrap_or("").to_string(),
                reason: ParentHierarchyErrorReason::Cycle,
            })
        }
    }
}

/// 生成 content を `spec_board_fs::task::file_scanner` 互換の eligible 条件で検証する。
///
/// - 1 MiB (1_048_576 byte) を超える content は `TooLarge` で弾く
/// - 先頭 8 KiB 範囲に NUL byte (0x00) を含む場合は `BinaryDetected` で弾く
///
/// scanner 側の閾値（`MAX_FILE_SIZE` / `BINARY_PROBE_LEN`）と揃えることで、
/// 作成直後に cache へ反映された Task が reopen / 再 scan 時に消えて state
/// 不整合が起きることを防ぐ。
fn validate_content_scanner_eligibility(content: &str) -> Result<(), CreateTaskError> {
    const MAX_FILE_SIZE: usize = 1024 * 1024;
    const BINARY_PROBE_LEN: usize = 8 * 1024;

    let bytes = content.as_bytes();
    if bytes.len() > MAX_FILE_SIZE {
        return Err(CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::TooLarge {
                size: bytes.len() as u64,
            },
        });
    }
    let probe_len = bytes.len().min(BINARY_PROBE_LEN);
    if bytes[..probe_len].contains(&0u8) {
        return Err(CreateTaskError::ContentNotScannerEligible {
            reason: ContentRejectReason::BinaryDetected,
        });
    }
    Ok(())
}

/// `target_dir.join(filename)` だが、`target_dir` が空 PathBuf の場合に
/// `Path::new("").join("x.md")` が `"x.md"` を返す挙動を活かしてルート直下を扱う。
fn join_rel_path(target_dir: &Path, filename: &str) -> PathBuf {
    if target_dir.as_os_str().is_empty() {
        PathBuf::from(filename)
    } else {
        target_dir.join(filename)
    }
}

#[cfg(test)]
#[path = "create_tests.rs"]
mod create_tests;
