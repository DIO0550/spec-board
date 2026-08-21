//! `.spec-board/templates/*.md` をタスク作成画面の雛形として返す `get_task_templates`
//! Tauri command。
//!
//! テンプレートは通常のタスク md と同じ frontmatter 形式で書く。ファイル I/O は
//! `spec-board-fs` の `template_io`、frontmatter の解釈は `task::frontmatter` /
//! `task::parse` の lenient 契約をそのまま使い、テンプレート専用の記法は導入しない
//! （人間・AI エージェントの双方が既存のタスク形式の知識だけで雛形を書けるようにする）。

use std::sync::Arc;

use serde::Serialize;
use spec_board_fs::config::template_io::read_template_files;
use tauri::State;
use thiserror::Error;

use crate::state::{AppState, AppStateError};
use crate::task::frontmatter::{self, Priority};
use crate::task::parse::extract_string_extra;

/// テンプレート 1 件分の payload。FE のタスク作成フォーム初期値に対応する。
///
/// `parent` はテンプレートから流し込まない（親は作成画面の文脈＝サブ Issue 経路が
/// 決めるもので、雛形にすると無関係な親が紛れ込むため）。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplatePayload {
    /// テンプレート名（拡張子を除いたファイル名）。
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<String>,
    pub links: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<String>,
    pub draft: bool,
    pub body: String,
}

/// `get_task_templates` コマンドが FE へ返す payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetTaskTemplatesPayload {
    /// テンプレート一覧（テンプレート名昇順）。
    pub templates: Vec<TaskTemplatePayload>,
}

/// `get_task_templates` コマンドのエラー。
#[derive(Debug, Error)]
pub enum GetTaskTemplatesError {
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned(#[from] AppStateError),
    #[error("テンプレートの読み込みに失敗しました: {0}")]
    Io(#[from] spec_board_fs::config::config_io::ConfigIoError),
}

/// Tauri command 薄層。`get_task_templates_impl` を呼び、エラーを文字列化して返す。
#[tauri::command]
pub fn get_task_templates(
    state: State<'_, Arc<AppState>>,
) -> Result<GetTaskTemplatesPayload, String> {
    get_task_templates_impl(state.inner()).map_err(|e| e.to_string())
}

/// `get_task_templates` の effect 層本体（テスト境界）。
///
/// プロジェクト未 open のときは空一覧を返す（作成画面はプロジェクト open 中しか
/// 到達しないため、エラーではなく「テンプレートなし」に倒す）。
/// frontmatter が壊れているテンプレートは一覧から除外する（作成フローを止めない）。
pub(crate) fn get_task_templates_impl(
    state: &AppState,
) -> Result<GetTaskTemplatesPayload, GetTaskTemplatesError> {
    let Some(snapshot) = state.session_snapshot()? else {
        return Ok(GetTaskTemplatesPayload {
            templates: Vec::new(),
        });
    };

    let files = read_template_files(snapshot.project_root().as_path())?;
    let templates = files
        .into_iter()
        .filter_map(|file| template_from_markdown(file.name, &file.content))
        .collect();

    Ok(GetTaskTemplatesPayload { templates })
}

/// テンプレート md 1 件を payload へ変換する。frontmatter が壊れている場合は `None`。
fn template_from_markdown(name: String, content: &str) -> Option<TaskTemplatePayload> {
    let parsed = match frontmatter::parse(content) {
        Ok(Some(parsed)) => parsed,
        Ok(None) => frontmatter::Parsed {
            frontmatter: frontmatter::Frontmatter::default(),
            body: content.to_string(),
        },
        Err(error) => {
            log::warn!("get_task_templates: skipping template `{name}`: {error}");
            return None;
        }
    };

    let extras = &parsed.frontmatter.extras;
    Some(TaskTemplatePayload {
        name,
        title: extract_string_extra(extras, "title").ok().flatten(),
        status: extract_string_extra(extras, "status").ok().flatten(),
        priority: parsed.frontmatter.priority,
        labels: parsed.frontmatter.labels,
        milestone: parsed.frontmatter.milestone,
        links: parsed.frontmatter.links,
        due: extract_string_extra(extras, "due").ok().flatten(),
        draft: parsed.frontmatter.draft == Some(true),
        body: parsed.body,
    })
}

#[cfg(test)]
#[path = "templates_tests.rs"]
mod templates_tests;
