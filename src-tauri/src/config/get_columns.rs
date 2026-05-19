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
    let config = state.config()?.ok_or(GetColumnsError::NoProjectOpen)?;

    // columns 非空は `Config` aggregate 側の不変条件として
    // `Config::load_or_default` が `EmptyColumns` で担保している。
    // `replace_config` 経由で空注入された場合は不変条件違反のため即時 panic で
    // 検出する（`resolved_done_column()` は done_column=Some なら columns 空でも
    // Some を返すため、空 columns チェックを独立に行う必要がある）。
    assert!(
        !config.columns.is_empty(),
        "config invariant violation: columns must be non-empty"
    );

    let mut columns: Vec<Column> = config.columns.clone();
    columns.sort_by_key(|column| column.order);

    let done_column = config
        .resolved_done_column()
        .expect(
            "config invariant violation: done column must be resolvable when columns is non-empty",
        )
        .as_str()
        .to_string();

    Ok(GetColumnsPayload {
        columns,
        done_column,
    })
}

#[cfg(test)]
#[path = "get_columns_tests.rs"]
mod get_columns_tests;
