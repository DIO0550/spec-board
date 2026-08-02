//! Task markdown の document/codec 境界。
//!
//! YAML の `Mapping` と `Parsed` はこのモジュールと `frontmatter` に閉じ込め、
//! command は typed な draft と patch を扱い、既存 aggregate の内部互換入力は document へ直ちに wrap する。

use thiserror::Error;

use crate::task::frontmatter::{self, Frontmatter, FrontmatterError, Parsed, Priority};
use crate::task::parse::TaskParseContext;
use crate::task::task_index::Task;

/// patch field の 3 状態。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub enum Patch<T> {
    /// 元の値を保持する。
    #[default]
    Unchanged,
    /// 指定した値を設定する。
    Set(T),
    /// 値を削除する。
    Clear,
}

/// create / preview が共有する typed markdown draft。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TaskDraft {
    pub title: String,
    pub status: String,
    pub priority: Option<Priority>,
    pub labels: Vec<String>,
    pub milestone: Option<String>,
    pub parent: Option<String>,
    pub links: Vec<String>,
    pub due: Option<String>,
    pub draft: bool,
    pub body: String,
}

/// 既存 markdown に適用する typed patch。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TaskPatch {
    pub title: Patch<String>,
    pub status: Patch<String>,
    pub priority: Patch<Priority>,
    pub labels: Patch<Vec<String>>,
    pub milestone: Patch<String>,
    pub parent: Patch<String>,
    pub links: Patch<Vec<String>>,
    pub draft: Patch<bool>,
    pub due: Patch<String>,
    pub body: Patch<String>,
}

/// document の parse / patch / render に失敗したエラー。
#[derive(Debug, Error)]
pub enum TaskDocumentError {
    #[error("frontmatter was not found")]
    NotTask,
    #[error(transparent)]
    Frontmatter(FrontmatterError),
    #[error("failed to render task document: {reason}")]
    Render { reason: String },
}

/// parsed markdown と typed patch/render API を保持する document。
#[derive(Debug, Clone, PartialEq)]
pub struct TaskDocument {
    parsed: Parsed,
}

impl TaskDocument {
    /// UTF-8 markdown bytes を document として読み込む。
    pub fn parse(input: &[u8]) -> Result<Self, TaskDocumentError> {
        let parsed = frontmatter::parse_bytes(input)
            .map_err(TaskDocumentError::Frontmatter)?
            .ok_or(TaskDocumentError::NotTask)?;
        Ok(Self { parsed })
    }

    /// codec 内の既存 Parsed を document に包む。
    pub(crate) fn from_parsed(parsed: Parsed) -> Self {
        Self { parsed }
    }

    /// typed draft から document を構築する。
    pub fn from_draft(draft: TaskDraft) -> Self {
        let mut extras = serde_yaml_ng::Mapping::new();
        insert_string(&mut extras, "title", draft.title);
        insert_string(&mut extras, "status", draft.status);
        if let Some(parent) = draft.parent.filter(|value| !value.is_empty()) {
            insert_string(&mut extras, "parent", parent);
        }
        if let Some(due) = draft.due.filter(|value| !value.is_empty()) {
            insert_string(&mut extras, "due", due);
        }

        let frontmatter = Frontmatter {
            priority: draft.priority,
            labels: draft.labels,
            milestone: draft.milestone.filter(|value| !value.is_empty()),
            links: draft.links,
            draft: draft.draft.then_some(true),
            extras,
        };

        Self {
            parsed: Parsed {
                frontmatter,
                body: normalize_body(draft.body),
            },
        }
    }

    /// typed patch を document に適用する。
    pub fn apply(&mut self, patch: TaskPatch) -> Result<(), TaskDocumentError> {
        apply_string_extra(&mut self.parsed.frontmatter.extras, "title", patch.title);
        apply_string_extra(&mut self.parsed.frontmatter.extras, "status", patch.status);
        apply_string_extra(&mut self.parsed.frontmatter.extras, "parent", patch.parent);
        apply_string_extra(&mut self.parsed.frontmatter.extras, "due", patch.due);

        apply_optional(&mut self.parsed.frontmatter.priority, patch.priority);
        apply_vec(&mut self.parsed.frontmatter.labels, patch.labels);
        apply_optional_string(&mut self.parsed.frontmatter.milestone, patch.milestone);
        apply_vec(&mut self.parsed.frontmatter.links, patch.links);
        apply_draft(&mut self.parsed.frontmatter.draft, patch.draft);
        apply_body(&mut self.parsed.body, patch.body);
        Ok(())
    }

    /// document を Task entity へ変換する。
    pub fn to_task(&self, context: &TaskParseContext) -> Task {
        crate::task::parse::task_from_parsed(self.parsed.clone(), context)
    }

    /// frontmatter と本文を markdown へ render する。
    pub fn render(&self) -> Result<String, TaskDocumentError> {
        match frontmatter::serialize(&self.parsed) {
            Ok(rendered) => Ok(rendered),
            Err(FrontmatterError::Serialize { source }) => Err(TaskDocumentError::Render {
                reason: source.to_string(),
            }),
            Err(error) => Err(TaskDocumentError::Frontmatter(error)),
        }
    }

    /// document を Parsed に戻す codec 内部 API。
    pub(crate) fn into_parsed(self) -> Parsed {
        self.parsed
    }

    #[cfg(test)]
    pub(crate) fn title_raw(&self) -> Option<&str> {
        string_extra(&self.parsed.frontmatter.extras, "title")
    }

    pub(crate) fn status_raw(&self) -> Option<&str> {
        string_extra(&self.parsed.frontmatter.extras, "status")
    }

    pub(crate) fn has_extra(&self, key: &str) -> bool {
        self.parsed
            .frontmatter
            .extras
            .contains_key(serde_yaml_ng::Value::String(key.to_string()))
    }

    #[cfg(test)]
    pub(crate) fn labels(&self) -> &[String] {
        &self.parsed.frontmatter.labels
    }

    pub(crate) fn links(&self) -> &[String] {
        &self.parsed.frontmatter.links
    }

    #[cfg(test)]
    pub(crate) fn body(&self) -> &str {
        &self.parsed.body
    }
}

fn insert_string(mapping: &mut serde_yaml_ng::Mapping, key: &str, value: String) {
    mapping.insert(
        serde_yaml_ng::Value::String(key.to_string()),
        serde_yaml_ng::Value::String(value),
    );
}

fn apply_string_extra(mapping: &mut serde_yaml_ng::Mapping, key: &str, patch: Patch<String>) {
    match patch {
        Patch::Unchanged => {}
        Patch::Set(value) => insert_string(mapping, key, value),
        Patch::Clear => {
            mapping.remove(serde_yaml_ng::Value::String(key.to_string()));
        }
    }
}

fn string_extra<'a>(mapping: &'a serde_yaml_ng::Mapping, key: &str) -> Option<&'a str> {
    mapping
        .get(serde_yaml_ng::Value::String(key.to_string()))
        .and_then(serde_yaml_ng::Value::as_str)
}

fn apply_optional<T>(target: &mut Option<T>, patch: Patch<T>) {
    match patch {
        Patch::Unchanged => {}
        Patch::Set(value) => *target = Some(value),
        Patch::Clear => *target = None,
    }
}

fn apply_optional_string(target: &mut Option<String>, patch: Patch<String>) {
    match patch {
        Patch::Unchanged => {}
        Patch::Set(value) if value.is_empty() => *target = None,
        Patch::Set(value) => *target = Some(value),
        Patch::Clear => *target = None,
    }
}

fn apply_vec(target: &mut Vec<String>, patch: Patch<Vec<String>>) {
    match patch {
        Patch::Unchanged => {}
        Patch::Set(value) => *target = value,
        Patch::Clear => target.clear(),
    }
}

fn apply_draft(target: &mut Option<bool>, patch: Patch<bool>) {
    match patch {
        Patch::Unchanged => {}
        Patch::Set(value) => *target = value.then_some(true),
        Patch::Clear => *target = None,
    }
}

fn apply_body(target: &mut String, patch: Patch<String>) {
    match patch {
        Patch::Unchanged => {}
        Patch::Set(value) => *target = normalize_body(value),
        Patch::Clear => target.clear(),
    }
}

fn normalize_body(body: String) -> String {
    if body.is_empty() || body.starts_with('\n') {
        return body;
    }
    format!("\n{body}")
}

#[cfg(test)]
#[path = "document_tests.rs"]
mod document_tests;
