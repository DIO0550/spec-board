//! `add_link` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::add_link::args::AddLinkArgs;
use crate::task::add_link::error::{AddLinkCommandError, AddLinkError};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::document::TaskDocument;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::payload::TaskPayload;
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{AddLinkOutcome, ParsedTask, ResolvedTaskSet, Task, TaskIndex};

/// `add_link` Tauri command 薄層。
#[tauri::command]
pub fn add_link(state: State<'_, Arc<AppState>>, args: AddLinkArgs) -> Result<TaskPayload, String> {
    add_link_impl(state.inner().as_ref(), &FsTaskIo, args)
        .map(TaskPayload::from)
        .map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn add_link_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: AddLinkArgs,
) -> Result<Task, AddLinkCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<Task, AddLinkCommandError> {
        let project_root = snapshot.project_root();
        let intent = args
            .into_intent(project_root.as_path())
            .map_err(AddLinkCommandError::Validation)?;
        let source_rel = intent.source.clone();
        let source_abs = project_root.as_path().join(&source_rel);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let existing_source = index
            .find_by_path(source_rel.as_path())
            .cloned()
            .ok_or_else(|| AddLinkError::SourceNotFound {
                path: source_rel.to_string_lossy().into_owned(),
            })?;
        if source_rel == intent.target {
            return Err(AddLinkError::SelfLink {
                path: source_rel.to_string_lossy().into_owned(),
            }
            .into());
        }
        if index.find_by_path(&intent.target).is_none() {
            return Err(AddLinkError::TargetNotFound {
                path: intent.target.to_string_lossy().into_owned(),
            }
            .into());
        }

        let resources = state.preflight_session_write(snapshot)?;
        let bytes = match io.read(&source_abs) {
            Ok(bytes) => bytes,
            Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
                return Err(AddLinkError::SourceNotFound {
                    path: source_rel.to_string_lossy().into_owned(),
                }
                .into());
            }
            Err(error) => return Err(error.into()),
        };
        let parsed = TaskDocument::parse(&bytes)
            .map_err(|error| AddLinkError::ParseFailed(error.to_string()))?
            .into_parsed();
        let outcome = index
            .plan_add_link(project_root.as_path(), intent, &existing_source, parsed)
            .map_err(AddLinkCommandError::Validation)?;

        let (updated_task, file_content, target_normalized) = match outcome {
            AddLinkOutcome::NoOp { existing_task } => return Ok(existing_task),
            AddLinkOutcome::Write {
                updated_task,
                file_content,
                target_normalized,
            } => (updated_task, file_content, target_normalized),
        };

        let (next_tasks, returned) = apply_add_link_to_cache(
            snapshot.tasks(),
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
            "add_link",
            move |session| {
                session.replace_tasks(next_tasks);
                returned
            },
        )
    })
}

/// planned link追加をcloned task mapへ適用する。
fn apply_add_link_to_cache(
    cache: &HashMap<CanonicalTaskPath, Task>,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &ParsedTask,
) -> Result<(ResolvedTaskSet, Task), AddLinkCommandError> {
    let source_key = CanonicalTaskPath::from_path(source_rel);
    if !cache.contains_key(&source_key) {
        return Err(AddLinkError::SourceVanished {
            path: source_key.as_str().to_string(),
        }
        .into());
    }
    if !cache.contains_key(&CanonicalTaskPath::new(target_normalized)) {
        return Err(AddLinkError::TargetVanished {
            path: target_normalized.to_string(),
        }
        .into());
    }
    let resolved = TaskIndex::new(cache.values().cloned().collect())
        .rebuild_with_external_change(crate::task::task_index::ExternalTaskChange::Upserted(
            Box::new(updated_task.clone()),
        ))
        .expect("adding a link cannot invalidate the resolved parent hierarchy")
        .tasks;
    let returned = resolved
        .get(&source_key)
        .cloned()
        .ok_or_else(|| AddLinkError::SourceVanished {
            path: source_key.as_str().to_string(),
        })
        .map_err(AddLinkCommandError::from)?;
    Ok((resolved, returned))
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
