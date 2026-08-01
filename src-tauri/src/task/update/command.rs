//! `update_task` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{Task, TaskIndex, UpdateTaskOutcome};
use crate::task::update::args::UpdateTaskArgs;
use crate::task::update::error::{UpdateTaskCommandError, UpdateTaskError};
use crate::task::warning::has_parent_cycle_warning;

/// `update_task` Tauri command 薄層。
#[tauri::command]
pub fn update_task(state: State<'_, Arc<AppState>>, args: UpdateTaskArgs) -> Result<Task, String> {
    update_task_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
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
        let parsed = frontmatter::parse_bytes(&bytes)
            .map_err(|error| UpdateTaskError::ParseFailed(error.to_string()))?
            .ok_or_else(|| {
                UpdateTaskError::ParseFailed("no frontmatter delimiter found".to_string())
            })?;
        let outcome = index
            .plan_update(project_root.as_path(), intent, &existing_task, parsed)
            .map_err(UpdateTaskCommandError::Validation)?;

        let mut next_tasks = snapshot.tasks().clone();
        let returned = apply_update_to_cache(&mut next_tasks, &rel_path, &outcome)?;
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
    cache: &mut HashMap<PathBuf, Task>,
    rel_path: &Path,
    outcome: &UpdateTaskOutcome,
) -> Result<Task, UpdateTaskCommandError> {
    let cache_key = rel_path.to_path_buf();
    let returned = if outcome.needs_full_rebuild {
        let values = cache.values().cloned().collect();
        let index = TaskIndex::new(values)
            .rebuild_with_replaced(outcome.updated_task.clone())
            .map_err(UpdateTaskError::from)?;
        cache.clear();
        for task in index.into_tasks() {
            cache.insert(PathBuf::from(task.file_path.as_str()), task);
        }
        cache.get(&cache_key).cloned()
    } else {
        let was_cycle_member = cache
            .get(&cache_key)
            .map(|previous| has_parent_cycle_warning(&previous.warnings))
            .unwrap_or(false);
        let mut next = outcome.updated_task.clone();
        next.preserve_parent_cycle_state(was_cycle_member, false);
        cache.insert(cache_key.clone(), next.clone());
        Some(next)
    };

    returned.ok_or(UpdateTaskCommandError::Validation(
        UpdateTaskError::FileNotFound(cache_key),
    ))
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
