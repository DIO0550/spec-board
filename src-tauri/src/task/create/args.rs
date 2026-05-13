//! `create_task` Tauri command の引数 DTO。

use serde::Deserialize;

/// FE 側 invoke の camelCase キーと整合させるため
/// `#[serde(rename_all = "camelCase")]` を付与する。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskArgs {
    /// タスクタイトル（必須）。空文字列は [`super::error::CreateTaskError::InvalidTitle`] となる。
    pub title: String,
    /// ステータス文字列（必須）。値域検証は本Issue では行わない。
    pub status: String,
    /// 優先度文字列。`"High" | "Medium" | "Low"` 想定。値域は frontmatter 側で検証。
    pub priority: Option<String>,
    /// ラベル一覧。未指定時は空配列。
    #[serde(default)]
    pub labels: Vec<String>,
    /// 親タスクへのプロジェクトルート相対パス（例: `tasks/parent-task.md`）。
    pub parent: Option<String>,
    /// 本文（Markdown）。未指定時は空文字列扱い。
    pub body: Option<String>,
}
