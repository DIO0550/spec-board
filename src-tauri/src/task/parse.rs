//! Markdown bytes → Task への変換ドメイン。
//!
//! frontmatter のパース、title / status / parent / extras の抽出と warning 発行、
//! `TaskParseContext` / `TaskParseError` を同居させる。

use std::collections::BTreeMap;
use std::path::Path;

use thiserror::Error;

use crate::config::column_name::ColumnName;
use crate::config::Config;
use crate::task::due::{Due, DueFromRaw};
use crate::task::frontmatter::{parse_bytes, FrontmatterError, Parsed, TYPED_KEYS};
use crate::task::label::Label;
use crate::task::path_normalization::normalize_path_parts;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::{ParentHierarchyErrorReason, ParsedTask};
use crate::task::task_title::TaskTitle;
use crate::task::warning::{TaskWarning, TaskWarningCode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskParseContext {
    pub file_path: std::path::PathBuf,
    pub default_status: ColumnName,
}

#[derive(Debug, Error)]
pub enum TaskParseError {
    #[error("frontmatter was not found")]
    NotTask,
    #[error("parent chain for '{file_path}' {reason}")]
    CycleOrTooDeep {
        file_path: String,
        reason: ParentHierarchyErrorReason,
    },
    #[error(transparent)]
    Frontmatter(#[from] FrontmatterError),
}

/// Markdown bytes と parse context から Task を生成する。
pub(crate) fn task_from_markdown(
    input: &[u8],
    context: &TaskParseContext,
) -> Result<ParsedTask, TaskParseError> {
    let Some(parsed) = parse_bytes(input)? else {
        return Err(TaskParseError::NotTask);
    };
    Ok(task_from_parsed(parsed, context))
}

/// Parsed frontmatter と parse context から Task を生成する。
pub(crate) fn task_from_parsed(parsed: Parsed, context: &TaskParseContext) -> ParsedTask {
    let mut warnings = Vec::new();
    let title = extract_title(&parsed, context, &mut warnings);
    let status = extract_status(&parsed, context, &mut warnings);
    let parent = extract_parent(&parsed, &mut warnings);
    let due = extract_due(&parsed, &mut warnings);
    let extras = convert_extras(&parsed, &mut warnings);
    let file_path = normalized_task_file_path(&context.file_path);
    let labels = parsed
        .frontmatter
        .labels
        .into_iter()
        .map(Label::from_lenient)
        .collect();
    let links = parsed
        .frontmatter
        .links
        .into_iter()
        .map(TaskFilePath::from_lenient)
        .collect();

    ParsedTask {
        id: file_path.clone(),
        file_path,
        title,
        status,
        priority: parsed.frontmatter.priority,
        milestone: parsed.frontmatter.milestone,
        draft: parsed.frontmatter.draft.unwrap_or(false),
        labels,
        parent,
        due,
        links,
        body: parsed.body,
        extras,
        parse_warnings: warnings,
    }
}

/// Task payload 用の file path を forward slash 区切りの正規化済み VO に変換する。
pub(crate) fn normalized_task_file_path(path: &Path) -> TaskFilePath {
    match TaskFilePath::from_relative_path(path) {
        Ok(vo) => vo,
        Err(_) => {
            let raw = path.to_string_lossy().replace('\\', "/");
            let normalized = normalize_path_parts(&raw, true);
            TaskFilePath::from_lenient(normalized)
        }
    }
}

/// `Config::columns` の `order` 昇順先頭の `name` を default status として返す。
pub(crate) fn default_status_for(config: &Config) -> ColumnName {
    config
        .columns
        .iter()
        .min_by_key(|column| column.order)
        .map(|column| ColumnName::from_lenient(column.name.as_str()))
        .unwrap_or_else(|| ColumnName::from_lenient(""))
}

fn extract_title(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> TaskTitle {
    match extract_string_extra(&parsed.frontmatter.extras, "title") {
        Ok(Some(title)) if !title.is_empty() => TaskTitle::from_lenient(title),
        Ok(Some(_)) | Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidTitleUsedFileName,
                Some("title"),
                "title is invalid; file name was used",
            ));
            title_fallback_from_file_path(&context.file_path)
        }
        Ok(None) => {
            warnings.push(warning(
                TaskWarningCode::MissingTitleUsedFileName,
                Some("title"),
                "title is missing; file name was used",
            ));
            title_fallback_from_file_path(&context.file_path)
        }
    }
}

fn extract_status(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> ColumnName {
    match extract_string_extra(&parsed.frontmatter.extras, "status") {
        Ok(Some(status)) => ColumnName::from_lenient(status),
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidStatusUsedDefault,
                Some("status"),
                "status is invalid; default status was used",
            ));
            ColumnName::from_lenient(context.default_status.as_str())
        }
        Ok(None) => {
            warnings.push(warning(
                TaskWarningCode::MissingStatusUsedDefault,
                Some("status"),
                "status is missing; default status was used",
            ));
            ColumnName::from_lenient(context.default_status.as_str())
        }
    }
}

fn extract_parent(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> Option<TaskFilePath> {
    match extract_string_extra(&parsed.frontmatter.extras, "parent") {
        Ok(parent) => parent.map(TaskFilePath::from_lenient),
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidParentIgnored,
                Some("parent"),
                "parent is invalid; value was ignored",
            ));
            None
        }
    }
}

/// extras["due"] を読み、`Task.due`（`Due` VO・原文保持）を返す。
///
/// - キー無し / 空文字 → None（warning なし、省略相当）
/// - `YYYY-MM-DD` として妥当 → Some(Due)
/// - 不正フォーマット → Some(Due)（原文保持）を返しつつ invalidDue warning を push
/// - 文字列でない due（数値・マッピング等）→ invalidDue warning を付与して None
fn extract_due(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> Option<Due> {
    let raw = match extract_string_extra(&parsed.frontmatter.extras, "due") {
        Ok(Some(value)) => value,
        Ok(None) => {
            return None;
        }
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidDue,
                Some("due"),
                "due is not a string; value was ignored",
            ));
            return None;
        }
    };

    match Due::from_raw(&raw) {
        DueFromRaw::Unset => None,
        DueFromRaw::Valid(due) => Some(due),
        DueFromRaw::Invalid(due) => {
            warnings.push(warning(
                TaskWarningCode::InvalidDue,
                Some("due"),
                "due is not a valid YYYY-MM-DD date; original value was kept",
            ));
            Some(due)
        }
    }
}

fn convert_extras(
    parsed: &Parsed,
    warnings: &mut Vec<TaskWarning>,
) -> BTreeMap<String, serde_json::Value> {
    let mut extras = BTreeMap::new();

    for (key, value) in &parsed.frontmatter.extras {
        let serde_yaml_ng::Value::String(key) = key else {
            warnings.push(warning(
                TaskWarningCode::NonStringExtraKeyIgnored,
                None,
                "non-string extra key was ignored",
            ));
            continue;
        };

        if TYPED_KEYS.contains(&key.as_str()) {
            continue;
        }

        let Some(json_value) = yaml_value_to_json(value) else {
            warnings.push(warning(
                TaskWarningCode::ExtraValueNotJsonCompatible,
                Some(key),
                "extra value is not JSON compatible; value was ignored",
            ));
            continue;
        };

        extras.insert(key.clone(), json_value);
    }

    extras
}

fn warning(code: TaskWarningCode, field: Option<&str>, message: &str) -> TaskWarning {
    TaskWarning {
        code,
        field: field.map(str::to_string),
        message: message.to_string(),
    }
}

pub(crate) fn extract_string_extra(
    extras: &serde_yaml_ng::Mapping,
    key: &str,
) -> Result<Option<String>, ()> {
    let Some(value) = extras.get(key) else {
        return Ok(None);
    };
    let serde_yaml_ng::Value::String(s) = value else {
        return Err(());
    };
    Ok(Some(s.clone()))
}

fn title_fallback_from_file_path(path: &Path) -> TaskTitle {
    let Some(stem) = path.file_stem() else {
        return TaskTitle::from_lenient("Untitled");
    };
    let title = stem.to_string_lossy().replace('-', " ");
    if title.is_empty() {
        return TaskTitle::from_lenient("Untitled");
    }
    TaskTitle::from_lenient(title)
}

fn yaml_value_to_json(value: &serde_yaml_ng::Value) -> Option<serde_json::Value> {
    if matches!(value, serde_yaml_ng::Value::Tagged(_)) {
        return None;
    }
    serde_json::to_value(value).ok()
}

#[cfg(test)]
#[path = "parse_tests.rs"]
mod parse_tests;
