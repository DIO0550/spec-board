//! `get_columns` Tauri command 本体（スケルトン）。

use serde::Serialize;
use thiserror::Error;

use super::Column;
use crate::state::{AppState, AppStateError};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetColumnsPayload {
    pub columns: Vec<Column>,
    pub done_column: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetColumnsError {
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
}

impl From<AppStateError> for GetColumnsError {
    fn from(_: AppStateError) -> Self {
        GetColumnsError::StateLockPoisoned
    }
}

pub(crate) fn get_columns_impl(state: &AppState) -> Result<GetColumnsPayload, GetColumnsError> {
    let _config = state.config()?.ok_or(GetColumnsError::NoProjectOpen)?;
    unimplemented!("happy path is implemented in the next cycle")
}

#[cfg(test)]
#[path = "get_columns_tests.rs"]
mod get_columns_tests;
