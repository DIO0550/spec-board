//! ゴミ箱（`.spec-board/trash/`）の一覧・復元・完全削除の Tauri command 実装。
//!
//! - ゴミ箱への投入は `delete_task` 側が行う（削除 = trash への移動。`task::delete`）。
//! - 置き場は削除時の project_root 相対パスをそのままミラーする（archive と同型）。
//!   `.spec-board/` 配下は task scanner / watcher の走査対象外。
//! - `restore_trashed_task` は unarchive_task と同じく cache を変更せず、
//!   復元ファイルの取り込みを watcher の外部作成検知に委ねる。
//! - `deletedAt` はゴミ箱内ファイルの更新時刻から導出する。移動は
//!   read → 排他 write の合成なので、書き込んだ時刻＝削除時刻になる。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use spec_board_fs::task::file_scanner::scan_md_files;
use tauri::State;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use super::args::{PurgeTrashedTaskArgs, RestoreTrashedTaskArgs};
use super::error::{
    GetTrashedTasksError, PurgeTrashError, RestoreTrashedTaskCommandError, RestoreTrashedTaskError,
};
use crate::state::AppState;
use crate::task::archive::args::resolve_input_file_path;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::parse::extract_string_extra;
use crate::task::relocate::{move_md_file, RelocateError};

/// `.spec-board/` 配下のゴミ箱ディレクトリ名。
const TRASH_DIR_NAME: &str = "trash";

/// ゴミ箱内タスク 1 件分の payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashedTaskPayload {
    /// ゴミ箱内相対パス（= 削除時の元 project_root 相対パス）。
    pub file_path: String,
    /// frontmatter `title`（読めない場合はファイル名 stem へフォールバック）。
    pub title: String,
    /// frontmatter `status`（読めない場合は省略）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    /// 削除日時（RFC 3339 / UTC）。取得できない場合は省略。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
}

/// `get_trashed_tasks` コマンドが FE へ返す payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTrashedTasksPayload {
    /// ゴミ箱内タスク一覧（ゴミ箱内相対パス昇順）。
    pub tasks: Vec<TrashedTaskPayload>,
}

/// `restore_trashed_task` コマンドが FE へ返す payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreTrashedTaskPayload {
    /// 実際に復元された project_root 相対パス（衝突時は連番付き）。
    pub restored_file_path: String,
}

/// `<project_root>/.spec-board/trash/` のパスを返す（純粋計算、I/O なし）。
pub(crate) fn trash_dir(project_root: &Path) -> PathBuf {
    project_root.join(".spec-board").join(TRASH_DIR_NAME)
}

/// ゴミ箱内の移動先（`.spec-board/trash/<元相対パス>`）を返す。
pub(crate) fn trash_destination(project_root: &Path, rel_path: &Path) -> PathBuf {
    trash_dir(project_root).join(rel_path)
}

/// `get_trashed_tasks` Tauri command 薄層。
#[tauri::command]
pub fn get_trashed_tasks(
    state: State<'_, Arc<AppState>>,
) -> Result<GetTrashedTasksPayload, String> {
    get_trashed_tasks_impl(state.inner()).map_err(|e| e.to_string())
}

/// `get_trashed_tasks` の effect 層本体（テスト境界）。
///
/// プロジェクト未 open・ゴミ箱不在は空一覧。frontmatter が読めないファイルも
/// 一覧に載せる（復元手段を失わせないため。archive の一覧と同じ方針）。
pub(crate) fn get_trashed_tasks_impl(
    state: &AppState,
) -> Result<GetTrashedTasksPayload, GetTrashedTasksError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Ok(GetTrashedTasksPayload { tasks: Vec::new() });
    };
    let dir = trash_dir(snapshot.project_root().as_path());
    if !dir.is_dir() {
        return Ok(GetTrashedTasksPayload { tasks: Vec::new() });
    }

    let mut rel_paths = scan_md_files(&dir)?;
    rel_paths.sort();
    let tasks = rel_paths
        .into_iter()
        .map(|rel| trashed_payload_from_file(&dir, rel))
        .collect();
    Ok(GetTrashedTasksPayload { tasks })
}

/// ゴミ箱内の 1 ファイルから一覧表示用 payload を組み立てる。
fn trashed_payload_from_file(trash_root: &Path, rel: PathBuf) -> TrashedTaskPayload {
    let abs = trash_root.join(&rel);
    let fallback_title = rel
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("task")
        .to_string();
    let file_path = rel.to_string_lossy().replace('\\', "/");
    let content = std::fs::read_to_string(&abs).unwrap_or_default();
    let parsed = frontmatter::parse(&content).ok().flatten();
    let extras = parsed.as_ref().map(|parsed| &parsed.frontmatter.extras);
    let title = extras
        .and_then(|extras| extract_string_extra(extras, "title").ok().flatten())
        .filter(|title| !title.is_empty())
        .unwrap_or(fallback_title);
    let status = extras.and_then(|extras| extract_string_extra(extras, "status").ok().flatten());
    TrashedTaskPayload {
        file_path,
        title,
        status,
        deleted_at: deleted_at_from_mtime(&abs),
    }
}

/// ゴミ箱内ファイルの更新時刻を RFC 3339（UTC）で返す。取得できなければ `None`。
fn deleted_at_from_mtime(abs: &Path) -> Option<String> {
    let modified = std::fs::metadata(abs).ok()?.modified().ok()?;
    OffsetDateTime::from(modified).format(&Rfc3339).ok()
}

/// `restore_trashed_task` Tauri command 薄層。
#[tauri::command]
pub fn restore_trashed_task(
    state: State<'_, Arc<AppState>>,
    args: RestoreTrashedTaskArgs,
) -> Result<RestoreTrashedTaskPayload, String> {
    restore_trashed_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `restore_trashed_task` の effect 層本体（テスト境界）。
///
/// ゴミ箱内相対パスの位置（= 元の場所）へファイルを書き戻す。復元先に同名が
/// ある場合は `-2` からの連番で回避し、実際の復元先パスを返す。
/// write-ignore を登録しないため、復元ファイルは watcher が外部作成として拾う。
pub(crate) fn restore_trashed_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: RestoreTrashedTaskArgs,
) -> Result<RestoreTrashedTaskPayload, RestoreTrashedTaskCommandError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Err(RestoreTrashedTaskCommandError::NoProjectOpen);
    };
    let project_root = snapshot.project_root();
    let rel_path = resolve_input_file_path(&args.file_path, project_root.as_path())
        .map_err(|_| RestoreTrashedTaskError::InvalidPath(args.file_path.clone()))?;
    let src = trash_destination(project_root.as_path(), &rel_path);
    let dest = project_root.as_path().join(&rel_path);

    let restored_abs = match move_md_file(io, &src, &dest) {
        Ok(path) => path,
        Err(RelocateError::SourceNotFound) => {
            return Err(RestoreTrashedTaskError::FileNotFound(src).into());
        }
        Err(RelocateError::DestinationUnavailable) => {
            return Err(RestoreTrashedTaskError::DestinationUnavailable(dest).into());
        }
        Err(RelocateError::Io(io_error)) => return Err(io_error.into()),
    };

    let restored_rel = restored_abs
        .strip_prefix(project_root.as_path())
        .unwrap_or(&restored_abs)
        .to_string_lossy()
        .replace('\\', "/");
    Ok(RestoreTrashedTaskPayload {
        restored_file_path: restored_rel,
    })
}

/// `purge_trashed_task` Tauri command 薄層。
#[tauri::command]
pub fn purge_trashed_task(
    state: State<'_, Arc<AppState>>,
    args: PurgeTrashedTaskArgs,
) -> Result<(), String> {
    purge_trashed_task_impl(state.inner(), args).map_err(|e| e.to_string())
}

/// `purge_trashed_task` の effect 層本体（テスト境界）。ゴミ箱内の 1 件を完全削除する。
pub(crate) fn purge_trashed_task_impl(
    state: &AppState,
    args: PurgeTrashedTaskArgs,
) -> Result<(), PurgeTrashError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Err(PurgeTrashError::NoProjectOpen);
    };
    let project_root = snapshot.project_root();
    let rel_path = resolve_input_file_path(&args.file_path, project_root.as_path())
        .map_err(|_| PurgeTrashError::InvalidPath(args.file_path.clone()))?;
    let abs = trash_destination(project_root.as_path(), &rel_path);
    match std::fs::remove_file(&abs) {
        Ok(()) => Ok(()),
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
            Err(PurgeTrashError::FileNotFound(abs))
        }
        Err(source) => Err(PurgeTrashError::Io(source)),
    }
}

/// `empty_trash` Tauri command 薄層。
#[tauri::command]
pub fn empty_trash(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    empty_trash_impl(state.inner()).map_err(|e| e.to_string())
}

/// `empty_trash` の effect 層本体（テスト境界）。ゴミ箱ディレクトリごと完全削除する。
///
/// ゴミ箱が存在しない場合は何もしない（冪等）。
pub(crate) fn empty_trash_impl(state: &AppState) -> Result<(), PurgeTrashError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Err(PurgeTrashError::NoProjectOpen);
    };
    let dir = trash_dir(snapshot.project_root().as_path());
    if !dir.is_dir() {
        return Ok(());
    }
    std::fs::remove_dir_all(&dir).map_err(PurgeTrashError::Io)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
