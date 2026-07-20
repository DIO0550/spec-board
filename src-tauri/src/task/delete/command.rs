use std::path::PathBuf;
use std::sync::Arc;

use tauri::State;

use super::args::DeleteTaskArgs;
use super::error::{DeleteTaskCommandError, DeleteTaskError};
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::task_index::TaskIndex;

/// `delete_task` Tauri command 薄層。
///
/// `delete_task_impl` を呼び、エラーは Display 文字列化して FE へ返す。
#[tauri::command]
pub fn delete_task(state: State<'_, Arc<AppState>>, args: DeleteTaskArgs) -> Result<(), String> {
    delete_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `delete_task` の effect 層本体（テスト境界）。
///
/// I/O は `TaskIo` port 経由で実行し、`state.rs` が定める lock 取得順序契約
/// (project_path -> tasks_cache -> watcher_handle -> write_ignore) を維持する。
pub(crate) fn delete_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: DeleteTaskArgs,
) -> Result<(), DeleteTaskCommandError> {
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    let project_root = state
        .project_path()?
        .ok_or(DeleteTaskCommandError::NoProjectOpen)?;
    let snapshot = state.tasks_snapshot()?;

    let intent = args.into_intent(project_root.as_path())?;
    let rel_path = intent.file_path;
    let abs = project_root.join(&rel_path);

    let index = TaskIndex::from(snapshot);
    if index.find_by_path(&rel_path).is_none() {
        return Err(DeleteTaskError::FileNotFound(abs).into());
    }
    let rel_str = rel_path.to_string_lossy();
    index.plan_delete_abort(&rel_str)?;

    let watcher_active = state.is_watcher_installed()?;

    if watcher_active {
        state.write_ignore().register(&abs)?;
    }

    if let Err(err) = io.remove(&abs) {
        if watcher_active {
            let _ = state.write_ignore().unregister(&abs);
        }
        let crate::task::io::TaskIoError::Io(ref e) = err;
        if e.kind() == std::io::ErrorKind::NotFound {
            return Err(DeleteTaskError::FileNotFound(abs).into());
        }
        return Err(err.into());
    }

    let cache_key: PathBuf = rel_path;
    let result = state.with_tasks_cache_mut(|cache| {
        cache.remove(&cache_key);
    });
    if let Err(err) = result {
        if watcher_active {
            let _ = state.write_ignore().unregister(&abs);
        }
        return Err(err.into());
    }

    Ok(())
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
