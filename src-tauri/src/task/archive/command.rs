//! `archive_task` / `get_archived_tasks` / `unarchive_task` の Tauri command 実装。
//!
//! - アーカイブ置き場は `.spec-board/archive/` で、元の project_root 相対パスを
//!   そのままミラーして保存する（復元時に元の場所へ戻せるようにするため）。
//!   `.spec-board/` 配下は task scanner / watcher の走査対象外なので、移動した
//!   時点でボードと再オープンの両方から自然に消える。
//! - `archive_task` は delete_task と同じ writer lease + resident commit 経路を通り、
//!   ボードへ即時反映する。
//! - `unarchive_task` はファイルを tasks ツリーへ戻すだけで cache を変更しない。
//!   write-ignore も登録しないため、watcher が通常の外部作成として拾い、
//!   再オープンと同じ経路でボードへ反映される（反映は watcher の集約分だけ遅延する）。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use spec_board_fs::task::file_scanner::scan_md_files;
use tauri::State;

use super::args::{resolve_input_file_path, ArchiveTaskArgs, UnarchiveTaskArgs};
use super::error::{
    ArchiveTaskCommandError, ArchiveTaskError, GetArchivedTasksError, UnarchiveTaskCommandError,
    UnarchiveTaskError,
};
use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::parse::extract_string_extra;
use crate::task::relocate::{move_md_file, RelocateError};
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{ExternalTaskChange, TaskIndex};

/// `.spec-board/` 配下のアーカイブ置き場ディレクトリ名。
const ARCHIVE_DIR_NAME: &str = "archive";

/// アーカイブ済みタスク 1 件分の payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchivedTaskPayload {
    /// アーカイブ内相対パス（= アーカイブ時の元 project_root 相対パス）。
    pub file_path: String,
    /// frontmatter `title`（読めない場合はファイル名 stem へフォールバック）。
    pub title: String,
    /// frontmatter `status`（読めない場合は省略）。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

/// `get_archived_tasks` コマンドが FE へ返す payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetArchivedTasksPayload {
    /// アーカイブ済みタスク一覧（アーカイブ内相対パス昇順）。
    pub tasks: Vec<ArchivedTaskPayload>,
}

/// `unarchive_task` コマンドが FE へ返す payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnarchiveTaskPayload {
    /// 実際に復元された project_root 相対パス（衝突時は連番付き）。
    pub restored_file_path: String,
}

/// `<project_root>/.spec-board/archive/` のパスを返す（純粋計算、I/O なし）。
fn archive_dir(project_root: &Path) -> PathBuf {
    project_root.join(".spec-board").join(ARCHIVE_DIR_NAME)
}

/// `archive_task` Tauri command 薄層。
#[tauri::command]
pub fn archive_task(state: State<'_, Arc<AppState>>, args: ArchiveTaskArgs) -> Result<(), String> {
    archive_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `archive_task` の effect 層本体（テスト境界）。
///
/// delete_task と同じ「writer lease → 検証 → disk 反映 → resident commit」の順で、
/// disk 反映だけが remove から「アーカイブ先へ移動」に変わる。
pub(crate) fn archive_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: ArchiveTaskArgs,
) -> Result<(), ArchiveTaskCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<(), ArchiveTaskCommandError> {
        let project_root = snapshot.project_root();
        let rel_path = resolve_input_file_path(&args.file_path, project_root.as_path())?;
        let abs = project_root.as_path().join(&rel_path);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let archived_file_path = index
            .find_by_path(&rel_path)
            .map(|task| task.file_path().clone())
            .ok_or_else(|| ArchiveTaskError::FileNotFound(abs.clone()))?;
        let rel_str = rel_path.to_string_lossy();
        let children = index.children_paths_of(&rel_str);
        if !children.is_empty() {
            return Err(ArchiveTaskError::HasChildren {
                path: rel_str.into_owned(),
                children,
            }
            .into());
        }

        let resolved = index.rebuild_with_external_change(ExternalTaskChange::Removed(
            archived_file_path.clone(),
        ))?;
        let next_tasks = resolved.tasks;
        let resources = state.preflight_session_write(snapshot)?;
        let registered_paths = vec![abs.clone()];
        resources.write_ignore().register(&abs)?;

        let destination = archive_destination(project_root.as_path(), &rel_path);
        if let Err(error) = move_md_file(io, &abs, &destination) {
            cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
            return Err(archive_move_error(error, &abs, &destination));
        }

        commit_or_resync_under_lease(
            state,
            target.project_root(),
            &snapshot.identity(),
            &resources,
            &registered_paths,
            ResyncSource::Tasks { task_io: io },
            "archive_task",
            move |session| session.replace_tasks(next_tasks),
        )
    })
}

/// アーカイブ先の基準パス（`.spec-board/archive/<元相対パス>`）を返す。
fn archive_destination(project_root: &Path, rel_path: &Path) -> PathBuf {
    archive_dir(project_root).join(rel_path)
}

/// [`RelocateError`] を archive 側のエラーへ写像する。
fn archive_move_error(error: RelocateError, src: &Path, dest: &Path) -> ArchiveTaskCommandError {
    match error {
        RelocateError::SourceNotFound => ArchiveTaskError::FileNotFound(src.to_path_buf()).into(),
        RelocateError::DestinationUnavailable => {
            ArchiveTaskError::DestinationUnavailable(dest.to_path_buf()).into()
        }
        RelocateError::Io(io_error) => io_error.into(),
    }
}

/// `get_archived_tasks` Tauri command 薄層。
#[tauri::command]
pub fn get_archived_tasks(
    state: State<'_, Arc<AppState>>,
) -> Result<GetArchivedTasksPayload, String> {
    get_archived_tasks_impl(state.inner()).map_err(|e| e.to_string())
}

/// `get_archived_tasks` の effect 層本体（テスト境界）。
///
/// プロジェクト未 open・アーカイブ置き場不在は空一覧を返す。
/// frontmatter が読めないファイルも一覧には載せる（title はファイル名へ
/// フォールバック）。アーカイブは復元のための一覧なので、壊れた md を
/// 隠すと復元手段ごと失われるため除外しない。
pub(crate) fn get_archived_tasks_impl(
    state: &AppState,
) -> Result<GetArchivedTasksPayload, GetArchivedTasksError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Ok(GetArchivedTasksPayload { tasks: Vec::new() });
    };
    let dir = archive_dir(snapshot.project_root().as_path());
    if !dir.is_dir() {
        return Ok(GetArchivedTasksPayload { tasks: Vec::new() });
    }

    let mut rel_paths = scan_md_files(&dir)?;
    rel_paths.sort();
    let tasks = rel_paths
        .into_iter()
        .map(|rel| archived_payload_from_file(&dir, rel))
        .collect();
    Ok(GetArchivedTasksPayload { tasks })
}

/// アーカイブ内の 1 ファイルから一覧表示用 payload を組み立てる。
fn archived_payload_from_file(archive_root: &Path, rel: PathBuf) -> ArchivedTaskPayload {
    let fallback_title = rel
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("task")
        .to_string();
    let file_path = rel.to_string_lossy().replace('\\', "/");
    let content = std::fs::read_to_string(archive_root.join(&rel)).unwrap_or_default();
    let parsed = frontmatter::parse(&content).ok().flatten();
    let extras = parsed.as_ref().map(|parsed| &parsed.frontmatter.extras);
    let title = extras
        .and_then(|extras| extract_string_extra(extras, "title").ok().flatten())
        .filter(|title| !title.is_empty())
        .unwrap_or(fallback_title);
    let status = extras.and_then(|extras| extract_string_extra(extras, "status").ok().flatten());
    ArchivedTaskPayload {
        file_path,
        title,
        status,
    }
}

/// `unarchive_task` Tauri command 薄層。
#[tauri::command]
pub fn unarchive_task(
    state: State<'_, Arc<AppState>>,
    args: UnarchiveTaskArgs,
) -> Result<UnarchiveTaskPayload, String> {
    unarchive_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `unarchive_task` の effect 層本体（テスト境界）。
///
/// アーカイブ内相対パスをそのまま元の場所へ書き戻す。復元先に同名ファイルが
/// ある場合は `-2` からの連番で回避し、実際の復元先パスを返す。
/// write-ignore を登録しないため、復元ファイルは watcher が外部作成として拾い、
/// resident cache / board へは watcher 経路で反映される。
pub(crate) fn unarchive_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: UnarchiveTaskArgs,
) -> Result<UnarchiveTaskPayload, UnarchiveTaskCommandError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Err(UnarchiveTaskCommandError::NoProjectOpen);
    };
    let project_root = snapshot.project_root();
    let rel_path = resolve_input_file_path(&args.file_path, project_root.as_path())
        .map_err(|_| UnarchiveTaskError::InvalidPath(args.file_path.clone()))?;
    let src = archive_destination(project_root.as_path(), &rel_path);
    let dest = project_root.as_path().join(&rel_path);

    let restored_abs = match move_md_file(io, &src, &dest) {
        Ok(path) => path,
        Err(RelocateError::SourceNotFound) => {
            return Err(UnarchiveTaskError::FileNotFound(src).into());
        }
        Err(RelocateError::DestinationUnavailable) => {
            return Err(UnarchiveTaskError::DestinationUnavailable(dest).into());
        }
        Err(RelocateError::Io(io_error)) => return Err(io_error.into()),
    };

    let restored_rel = restored_abs
        .strip_prefix(project_root.as_path())
        .unwrap_or(&restored_abs)
        .to_string_lossy()
        .replace('\\', "/");
    Ok(UnarchiveTaskPayload {
        restored_file_path: restored_rel,
    })
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
