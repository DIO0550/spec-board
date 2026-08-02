//! `remove_link` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::document::TaskDocument;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::remove_link::args::RemoveLinkArgs;
use crate::task::remove_link::error::{RemoveLinkCommandError, RemoveLinkError};
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{RemoveLinkOutcome, Task, TaskIndex};

/// `remove_link` Tauri command 薄層。
#[tauri::command]
pub fn remove_link(state: State<'_, Arc<AppState>>, args: RemoveLinkArgs) -> Result<Task, String> {
    remove_link_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn remove_link_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: RemoveLinkArgs,
) -> Result<Task, RemoveLinkCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<Task, RemoveLinkCommandError> {
        let project_root = snapshot.project_root();
        let intent = args
            .into_intent(project_root.as_path())
            .map_err(RemoveLinkCommandError::Validation)?;
        let source_rel = intent.source.clone();
        let source_abs = project_root.as_path().join(&source_rel);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let existing_source = index
            .find_by_path(source_rel.as_path())
            .cloned()
            .ok_or_else(|| RemoveLinkError::SourceNotFound {
                path: source_rel.to_string_lossy().into_owned(),
            })?;

        let resources = state.preflight_session_write(snapshot)?;
        let bytes = match io.read(&source_abs) {
            Ok(bytes) => bytes,
            Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
                return Err(RemoveLinkError::SourceNotFound {
                    path: source_rel.to_string_lossy().into_owned(),
                }
                .into());
            }
            Err(error) => return Err(error.into()),
        };
        let parsed = TaskDocument::parse(&bytes)
            .map_err(|error| RemoveLinkError::ParseFailed(error.to_string()))?
            .into_parsed();
        let outcome = index
            .plan_remove_link(project_root.as_path(), intent, &existing_source, parsed)
            .map_err(RemoveLinkCommandError::Validation)?;
        let (updated_task, file_content, target_normalized) = match outcome {
            RemoveLinkOutcome::NoOp { existing_task } => return Ok(existing_task),
            RemoveLinkOutcome::Write {
                updated_task,
                file_content,
                target_normalized,
            } => (updated_task, file_content, target_normalized),
        };

        let mut next_tasks = snapshot.tasks().clone();
        let returned = apply_remove_link_to_cache(
            &mut next_tasks,
            &source_rel,
            &target_normalized,
            &updated_task,
        )?;
        let registered_paths = vec![source_abs.clone()];
        resources.write_ignore().register(&source_abs)?;
        if let Err(error) = io.write_existing(&source_abs, file_content.as_bytes()) {
            cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
            return Err(error.into());
        }

        commit_or_resync_under_lease(
            state,
            target.project_root(),
            &snapshot.identity(),
            &resources,
            &registered_paths,
            ResyncSource::Tasks { task_io: io },
            "remove_link",
            move |session| {
                session.replace_tasks(next_tasks);
                returned
            },
        )
    })
}

/// planned link削除をcloned task mapへ適用する。
fn apply_remove_link_to_cache(
    cache: &mut HashMap<PathBuf, Task>,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &Task,
) -> Result<Task, RemoveLinkCommandError> {
    TaskIndex::commit_remove_link_into_cache(cache, source_rel, target_normalized, updated_task)
        .map_err(Into::into)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
