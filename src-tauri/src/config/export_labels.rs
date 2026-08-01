//! `export_labels` Tauri command 本体。
//!
//! 現在 `AppState.labels` に commit されている `LabelRegistry` を、ユーザーが
//! save ダイアログで選んだ**任意のパス**へ `labels.yml` 形式（`serde_yaml_ng::to_string`）で
//! 書き出す書き込み専用 command。`.spec-board/labels.yml` の store とは別経路で、
//! プロジェクト外への単発 export を担う。
//!
//! 直列化は BE 既存 store（`label_registry.rs::FsLabelRegistryStore::save`）と同じ
//! `serde_yaml_ng::to_string(&registry)` を転用するため、ディスク上の `labels.yml` と
//! エクスポート出力の形式（camelCase / 空フィールド `skip_serializing_if` / 正規化）が
//! 一致する。
//!
//! # 脅威モデル（任意パス書込）
//!
//! 本アプリはローカルデスクトップアプリで、保存先 `path` はユーザーが FE の
//! save ダイアログで明示的に選んだもの。アプリ権限の範囲でユーザー指定パスへ
//! 書き込むのは仕様（任意パス export 自体が機能要件）。ただし空 `path` は
//! [`ExportLabelsError::EmptyPath`] で弾き、親ディレクトリ不存在・書込権限なし等は
//! `std::fs::write` の失敗を [`ExportLabelsError::Write`] へ集約する。
//!
//! # ロック取得順序
//!
//! `labels` のみ（read-only 取得）。書込は project 外パスで store / lock を伴わないため
//! delete のような snapshot / lock preflight は不要。
//!
//! # エラー文字列の契約
//!
//! - `NoProjectOpen` の Display は `"プロジェクトが開かれていません"`（`delete_label` と一致）
//! - `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"`（同上）
//! - `EmptyPath` の Display は `"保存先のパスが空です"`

use std::sync::Arc;

use serde::Deserialize;
use tauri::State;
use thiserror::Error;

use crate::state::{AppState, AppStateError};

/// `export_labels` コマンドの引数。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportLabelsArgs {
    pub path: String,
}

/// `export_labels` コマンドのエラー。
#[derive(Debug, Error)]
pub enum ExportLabelsError {
    /// `path` が空文字列。
    #[error("保存先のパスが空です")]
    EmptyPath,
    /// `AppState.labels` が `None`（プロジェクト未オープン）。
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    /// `AppState` 内部 mutex (`labels`) が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    /// `serde_yaml_ng` での直列化失敗。
    #[error(transparent)]
    Serialize(serde_yaml_ng::Error),
    /// `std::fs::write` の I/O 失敗。
    #[error(transparent)]
    Write(std::io::Error),
}

impl From<AppStateError> for ExportLabelsError {
    fn from(_: AppStateError) -> Self {
        ExportLabelsError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`export_labels_impl` を呼び、エラーを文字列化して返す。
///
/// # Errors
///
/// - 空 path のとき `"保存先のパスが空です"`
/// - プロジェクト未オープン時に `"プロジェクトが開かれていません"`
/// - `labels` の `Mutex` が poison している場合に `"内部状態のロックが破損しました"`
/// - 直列化失敗 / I/O 失敗時はそれぞれの原因文字列を透過
#[tauri::command]
pub fn export_labels(
    state: State<'_, Arc<AppState>>,
    args: ExportLabelsArgs,
) -> Result<(), String> {
    export_labels_impl(state.inner(), &args).map_err(|e| e.to_string())
}

/// 単体テスト境界の effect 層。
///
/// 1. 空 path を `EmptyPath` で拒否する
/// 2. `session_snapshot()` を 1 回取得して coherent な labels registry を得る
/// 3. `serde_yaml_ng::to_string` で直列化（store と同一経路）
/// 4. `std::fs::write(args.path, yaml)` で任意パスへ書き出す
///
/// # Errors
///
/// - 空 path: [`ExportLabelsError::EmptyPath`]
/// - 未オープン: [`ExportLabelsError::NoProjectOpen`]
/// - lock poison: [`ExportLabelsError::StateLockPoisoned`]
/// - 直列化失敗: [`ExportLabelsError::Serialize`]
/// - 書込失敗: [`ExportLabelsError::Write`]
pub(crate) fn export_labels_impl(
    state: &AppState,
    args: &ExportLabelsArgs,
) -> Result<(), ExportLabelsError> {
    // 防御的に trim ベースで空判定する（FE は通常 save ダイアログ経由だが、
    // 不正な空白のみパスが直接 invoke された場合に意図しないパスへ write しない）。
    // write も trim 済みパスで行うため、前後空白を含んだまま OS へ渡らない。
    let path = args.path.trim();
    if path.is_empty() {
        return Err(ExportLabelsError::EmptyPath);
    }
    let snapshot = state
        .session_snapshot()?
        .ok_or(ExportLabelsError::NoProjectOpen)?;
    let yaml = serde_yaml_ng::to_string(snapshot.labels()).map_err(ExportLabelsError::Serialize)?;
    std::fs::write(path, yaml).map_err(ExportLabelsError::Write)?;
    Ok(())
}

#[cfg(test)]
#[path = "export_labels_tests.rs"]
mod export_labels_tests;
