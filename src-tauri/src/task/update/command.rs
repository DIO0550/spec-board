//! `update_task` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::document::TaskDocument;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::payload::TaskPayload;
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{ExternalTaskChange, Task, TaskIndex, UpdateTaskOutcome};
use crate::task::update::args::UpdateTaskArgs;
use crate::task::update::error::{UpdateTaskCommandError, UpdateTaskError};

/// `update_task` Tauri command 薄層。
#[tauri::command]
pub fn update_task(
    state: State<'_, Arc<AppState>>,
    args: UpdateTaskArgs,
) -> Result<TaskPayload, String> {
    update_task_impl(state.inner().as_ref(), &FsTaskIo, args)
        .map(TaskPayload::from)
        .map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn update_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: UpdateTaskArgs,
) -> Result<Task, UpdateTaskCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<Task, UpdateTaskCommandError> {
        let project_root = snapshot.project_root();
        let intent = args
            .into_intent(project_root.as_path())
            .map_err(UpdateTaskCommandError::Validation)?;
        let rel_path = intent.file_path.clone();
        let abs = project_root.as_path().join(&rel_path);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let existing_task = index
            .find_by_path(rel_path.as_path())
            .cloned()
            .ok_or_else(|| UpdateTaskError::FileNotFound(abs.clone()))?;

        if let Some(parent) = intent.parent.as_deref().filter(|parent| !parent.is_empty()) {
            if index.resolve_parent_for_new_task(parent).is_none() {
                return Err(UpdateTaskError::ParentNotFound {
                    path: parent.to_string(),
                }
                .into());
            }
        }

        let resources = state.preflight_session_write(snapshot)?;
        let bytes = match io.read(&abs) {
            Ok(bytes) => bytes,
            Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
                return Err(UpdateTaskError::FileNotFound(abs.clone()).into());
            }
            Err(error) => return Err(error.into()),
        };
        let parsed = TaskDocument::parse(&bytes)
            .map_err(|error| UpdateTaskError::ParseFailed(error.to_string()))?
            .into_parsed();
        let outcome = index
            .plan_update(project_root.as_path(), intent, &existing_task, parsed)
            .map_err(UpdateTaskCommandError::Validation)?;

        let (next_tasks, returned) = apply_update_to_cache(snapshot.tasks(), &rel_path, &outcome)?;
        let registered_paths = vec![abs.clone()];
        resources.write_ignore().register(&abs)?;
        if let Err(error) = io.write_existing(&abs, outcome.file_content.as_bytes()) {
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
            "update_task",
            move |session| {
                session.replace_tasks(next_tasks);
                returned
            },
        )
    })
}

/// planned updateをcloned task mapへ適用し、commit後の戻り値を作る。
fn apply_update_to_cache(
    cache: &HashMap<CanonicalTaskPath, Task>,
    rel_path: &Path,
    outcome: &UpdateTaskOutcome,
) -> Result<(crate::task::task_index::ResolvedTaskSet, Task), UpdateTaskCommandError> {
    let cache_key = CanonicalTaskPath::from_path(rel_path);
    let resolved = TaskIndex::new(cache.values().cloned().collect())
        .rebuild_with_external_change(ExternalTaskChange::Upserted(Box::new(
            outcome.updated_task.clone(),
        )))
        .map_err(UpdateTaskError::from)?;
    let returned = resolved.tasks.get(&cache_key).cloned();

    let returned = returned.ok_or(UpdateTaskCommandError::Validation(
        UpdateTaskError::FileNotFound(cache_key.as_path_buf()),
    ))?;
    Ok((resolved.tasks, returned))
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
