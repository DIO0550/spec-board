//! `create_task` Tauri command の引数 DTO。

use serde::Deserialize;

use crate::config::column_name::ColumnName;
use crate::task::frontmatter::Priority;
use crate::task::label::Label;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::CreateTaskIntent;
use crate::task::task_title::TaskTitle;

/// FE 側 invoke の camelCase キーと整合させるため
/// `#[serde(rename_all = "camelCase")]` を付与する。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskArgs {
    /// タスクタイトル（必須）。空文字列は [`super::error::CreateTaskError::InvalidTitle`] となる。
    pub title: String,
    /// ステータス文字列（必須）。値域検証は行わない。
    pub status: String,
    /// 優先度文字列。`"High" | "Medium" | "Low"` 想定。値域は frontmatter 側で検証。
    pub priority: Option<String>,
    /// マイルストーン参照キー（単数の自由文字列）。空文字 / 未指定は未割当。
    pub milestone: Option<String>,
    /// ラベル一覧。未指定時は空配列。
    #[serde(default)]
    pub labels: Vec<String>,
    /// 親タスクへのプロジェクトルート相対パス（例: `tasks/parent-task.md`）。
    pub parent: Option<String>,
    /// 関連タスク（links）へのプロジェクトルート相対パス一覧。未指定時は空配列。
    /// 生の raw path をそのまま受け取り、dedup・正規化は `plan_create` で行う。
    #[serde(default)]
    pub links: Vec<String>,
    /// 本文（Markdown）。未指定時は空文字列扱い。
    pub body: Option<String>,
    /// 明示指定するファイル名（`.md` 付き完全名）。未指定ならタイトルから自動生成。
    /// 検証・連番回避は `plan_create` 側の `TaskFileName::from_explicit` が担う。
    pub file_name: Option<String>,
    /// 期限（`YYYY-MM-DD`）。未指定・空文字なら frontmatter に due キーを出力しない。
    pub due: Option<String>,
    /// 下書きとして作成するか。省略時は false（通常作成）。
    #[serde(default)]
    pub draft: bool,
}

/// IPC 境界の `CreateTaskArgs` をドメインの `CreateTaskIntent` に詰め直す。
///
/// `Priority::from_ascii_ci` は不正値を `None` に倒す lenient 変換（既存挙動を維持）。
/// その他の文字列フィールドは VO の `from_lenient` で正規化する。
impl From<CreateTaskArgs> for CreateTaskIntent {
    fn from(args: CreateTaskArgs) -> Self {
        let priority = args.priority.as_deref().and_then(Priority::from_ascii_ci);
        Self {
            title: TaskTitle::from_lenient(args.title),
            status: ColumnName::from_lenient(args.status),
            priority,
            milestone: args.milestone,
            labels: args.labels.into_iter().map(Label::from).collect(),
            parent: args.parent.map(TaskFilePath::from_lenient),
            // raw のまま詰める。dedup・パス正規化・lenient 保持は plan_create が担う。
            links: args.links,
            body: args.body,
            file_name: args.file_name,
            due: args.due,
            draft: args.draft,
        }
    }
}

#[cfg(test)]
#[path = "args_tests.rs"]
mod args_tests;
