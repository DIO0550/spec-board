//! ゴミ箱操作の IPC 引数 DTO。

use serde::Deserialize;

/// FE 側 `RestoreTrashedTaskParams` と整合する IPC 引数 DTO。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreTrashedTaskArgs {
    /// 復元対象のゴミ箱内相対パス（削除時の元 project_root 相対パス）。
    pub file_path: String,
}

/// FE 側 `PurgeTrashedTaskParams` と整合する IPC 引数 DTO。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeTrashedTaskArgs {
    /// 完全削除対象のゴミ箱内相対パス。
    pub file_path: String,
}
