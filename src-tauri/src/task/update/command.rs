//! `update_task` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::state::AppState;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::task_index::{Task, TaskIndex, UpdateTaskOutcome};
use crate::task::update::args::UpdateTaskArgs;
use crate::task::update::error::{UpdateTaskCommandError, UpdateTaskError};

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
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    let project_root = state
        .project_path()?
        .ok_or(UpdateTaskCommandError::NoProjectOpen)?;

    let intent = args
        .into_intent(project_root.as_path())
        .map_err(UpdateTaskCommandError::Validation)?;
    let rel_path = intent.file_path.clone();
    let abs = project_root.join(&rel_path);

    let snapshot = state.tasks_snapshot()?;
    let existing_task = snapshot
        .iter()
        .find(|t| Path::new(t.file_path.as_str()) == rel_path.as_path())
        .cloned()
        .ok_or_else(|| UpdateTaskError::FileNotFound(abs.clone()))?;

    let bytes = match io.read(&abs) {
        Ok(b) => b,
        Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
            return Err(UpdateTaskError::FileNotFound(abs.clone()).into());
        }
        Err(e) => return Err(e.into()),
    };

    let parsed = frontmatter::parse_bytes(&bytes)
        .map_err(|e| UpdateTaskError::ParseFailed(e.to_string()))?
        .ok_or_else(|| {
            UpdateTaskError::ParseFailed("no frontmatter delimiter found".to_string())
        })?;

    let index = TaskIndex::new(snapshot);
    let outcome: UpdateTaskOutcome = index
        .plan_update(project_root.as_path(), intent, &existing_task, parsed)
        .map_err(UpdateTaskCommandError::Validation)?;

    let watcher_active = state.is_watcher_installed()?;

    if watcher_active {
        state.write_ignore().register(&abs)?;
    }

    if let Err(err) = io.write_existing(&abs, outcome.file_content.as_bytes()) {
        if watcher_active {
            let _ = state.write_ignore().unregister(&abs);
        }
        return Err(err.into());
    }

    let returned = commit_cache(state, &rel_path, &outcome)?;
    Ok(returned)
}

/// cache を更新し、返却すべき最終的な Task を返す。
fn commit_cache(
    state: &AppState,
    rel_path: &Path,
    outcome: &UpdateTaskOutcome,
) -> Result<Task, UpdateTaskCommandError> {
    let cache_key: PathBuf = rel_path.to_path_buf();
    let returned = state.with_tasks_cache_mut(|cache: &mut HashMap<PathBuf, Task>| {
        if outcome.needs_full_rebuild {
            let mut values: Vec<Task> = cache.values().cloned().collect();
            let target_str = rel_path.to_string_lossy();
            if let Some(slot) = values
                .iter_mut()
                .find(|t| t.file_path.as_str() == target_str.as_ref())
            {
                *slot = outcome.updated_task.clone();
            } else {
                values.push(outcome.updated_task.clone());
            }
            let index = TaskIndex::new(values)
                .validate_parent_hierarchy()
                .expect("validated in plan_update")
                .build_children()
                .expect("validated in plan_update")
                .build_reverse_links();
            cache.clear();
            for task in index.into_tasks() {
                cache.insert(PathBuf::from(task.file_path.as_str()), task);
            }
            cache.get(&cache_key).cloned()
        } else {
            cache.insert(cache_key.clone(), outcome.updated_task.clone());
            Some(outcome.updated_task.clone())
        }
    })?;

    returned.ok_or(UpdateTaskCommandError::Validation(
        UpdateTaskError::FileNotFound(cache_key),
    ))
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
