//! `add_link` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::add_link::args::AddLinkArgs;
use crate::task::add_link::error::{AddLinkCommandError, AddLinkError};
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_index::{AddLinkOutcome, Task, TaskIndex};

/// `add_link` Tauri command 薄層。
#[tauri::command]
pub fn add_link(state: State<'_, Arc<AppState>>, args: AddLinkArgs) -> Result<Task, String> {
    add_link_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
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
        let parsed = frontmatter::parse_bytes(&bytes)
            .map_err(|error| AddLinkError::ParseFailed(error.to_string()))?
            .ok_or_else(|| {
                AddLinkError::ParseFailed("no frontmatter delimiter found".to_string())
            })?;
        let outcome = index
            .plan_add_link(project_root.as_path(), intent, &existing_source, parsed)
            .map_err(AddLinkCommandError::Validation)?;

        let AddLinkOutcome::Write {
            updated_task,
            file_content,
            target_normalized,
        } = outcome
        else {
            let AddLinkOutcome::NoOp { existing_task } = outcome else {
                unreachable!("all add-link outcomes handled")
            };
            return Ok(existing_task);
        };

        let mut next_tasks = snapshot.tasks().clone();
        let returned = apply_add_link_to_cache(
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
    cache: &mut HashMap<PathBuf, Task>,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &Task,
) -> Result<Task, AddLinkCommandError> {
    TaskIndex::commit_add_link_into_cache(cache, source_rel, target_normalized, updated_task)
        .map_err(Into::into)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
