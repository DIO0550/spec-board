use std::sync::Arc;

use tauri::State;

use super::args::DeleteTaskArgs;
use super::error::{DeleteTaskCommandError, DeleteTaskError};
use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::relocate::{move_md_file, RelocateError};
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{ExternalTaskChange, TaskIndex};
use crate::task::trash::command::trash_destination;

/// `delete_task` Tauri command 薄層。
///
/// `delete_task_impl` を呼び、エラーは Display 文字列化して FE へ返す。
#[tauri::command]
pub fn delete_task(state: State<'_, Arc<AppState>>, args: DeleteTaskArgs) -> Result<(), String> {
    delete_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `delete_task` の effect 層本体（テスト境界）。
///
/// 「削除」はディスク上では `.spec-board/trash/` への移動（ソフトデリート）で、
/// resident cache / board からは従来どおり即時に消える。復元系のコマンドは
/// `task::trash` を参照。
pub(crate) fn delete_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: DeleteTaskArgs,
) -> Result<(), DeleteTaskCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<(), DeleteTaskCommandError> {
        let project_root = snapshot.project_root();
        let intent = args.into_intent(project_root.as_path())?;
        let rel_path = intent.file_path;
        let abs = project_root.as_path().join(&rel_path);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let deleted_file_path = index
            .find_by_path(&rel_path)
            .map(|task| task.file_path().clone())
            .ok_or_else(|| DeleteTaskError::FileNotFound(abs.clone()))?;
        index.plan_delete_abort(&rel_path.to_string_lossy())?;

        let resolved = index
            .rebuild_with_external_change(ExternalTaskChange::Removed(deleted_file_path.clone()))
            .expect("removing a task cannot deepen a previously resolved parent chain");
        let next_tasks = resolved.tasks;
        let resources = state.preflight_session_write(snapshot)?;
        let registered_paths = vec![abs.clone()];
        resources.write_ignore().register(&abs)?;

        // 削除は即時の remove ではなく `.spec-board/trash/` へのソフトデリート。
        // 誤操作からの復旧手段（設定 > ゴミ箱 の復元）を残すため、md をミラー
        // 相対パスで退避する。`.spec-board/` 配下は scanner / watcher の対象外
        // なので、ボード・再オープンから見える挙動は従来の削除と同じ。
        let destination = trash_destination(project_root.as_path(), &rel_path);
        if let Err(error) = move_md_file(io, &abs, &destination) {
            cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
            return Err(match error {
                RelocateError::SourceNotFound => DeleteTaskError::FileNotFound(abs).into(),
                RelocateError::DestinationUnavailable => {
                    DeleteTaskError::TrashDestinationUnavailable(destination).into()
                }
                RelocateError::Io(io_error) => io_error.into(),
            });
        }

        commit_or_resync_under_lease(
            state,
            target.project_root(),
            &snapshot.identity(),
            &resources,
            &registered_paths,
            ResyncSource::Tasks { task_io: io },
            "delete_task",
            move |session| session.replace_tasks(next_tasks),
        )
    })
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
