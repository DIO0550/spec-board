use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

use crate::state::{AppState, AppStateError};
use crate::task::task_index::TaskIndex;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTaskFilenameArgs {
    pub title: String,
    pub explicit_filename: Option<String>,
    pub parent_file_path: Option<String>,
}

#[derive(Debug, Error)]
pub enum PreviewTaskFilenameError {
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned(#[from] AppStateError),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum PreviewTaskFilenamePayload {
    #[serde(rename = "path")]
    Path {
        file_name: String,
        rel_path: String,
        full_path: String,
    },
    #[serde(rename = "invalid")]
    Invalid { error: String },
    #[serde(rename = "pending")]
    Pending,
}

#[tauri::command]
pub fn preview_task_filename(
    state: State<'_, Arc<AppState>>,
    args: PreviewTaskFilenameArgs,
) -> Result<PreviewTaskFilenamePayload, String> {
    preview_task_filename_impl(state.inner(), args).map_err(|e| e.to_string())
}

pub(crate) fn preview_task_filename_impl(
    state: &AppState,
    args: PreviewTaskFilenameArgs,
) -> Result<PreviewTaskFilenamePayload, PreviewTaskFilenameError> {
    state.check_tasks_cache_lock()?;

    let project_root = match state.project_path()? {
        Some(p) => p,
        None => {
            return Ok(PreviewTaskFilenamePayload::Pending);
        }
    };

    let snapshot = state.tasks_snapshot()?;
    let index = TaskIndex::from(snapshot);
    let outcome = index.plan_preview_filename(&project_root, &args);

    Ok(outcome.into_payload(&project_root))
}

#[cfg(test)]
#[path = "preview_filename_tests.rs"]
mod preview_filename_tests;
