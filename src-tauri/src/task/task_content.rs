//! Task の md ファイル本文（frontmatter + body）を表す Value Object。
//!
//! `spec_board_fs::task::file_scanner` の eligible 条件（1 MiB 以下 / 先頭 8 KiB に
//! NUL byte なし）を constructor で強制し、構造的に invalid な content が cache や
//! FS に流れることを防ぐ。

use std::fmt;

use thiserror::Error;

use crate::task::create::error::{ContentRejectReason, CreateTaskError};
use crate::task::frontmatter::{serialize as serialize_frontmatter, Frontmatter, Parsed};
use crate::task::task_index::CreateTaskIntent;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskContent(String);

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum TaskContentError {
    #[error("task content size exceeds {limit} bytes (got {size})")]
    TooLarge { size: u64, limit: u64 },
    #[error("task content contains a NUL byte within the first {probe} bytes (binary file)")]
    BinaryDetected { probe: usize },
}

impl TaskContent {
    const MAX_FILE_SIZE: usize = 1024 * 1024;
    const BINARY_PROBE_LEN: usize = 8 * 1024;

    /// 1 MiB 超は `TooLarge`、先頭 8 KiB に NUL byte 含むなら `BinaryDetected`。
    pub fn try_new(content: String) -> Result<Self, TaskContentError> {
        let bytes = content.as_bytes();
        if bytes.len() > Self::MAX_FILE_SIZE {
            return Err(TaskContentError::TooLarge {
                size: bytes.len() as u64,
                limit: Self::MAX_FILE_SIZE as u64,
            });
        }
        let probe_len = bytes.len().min(Self::BINARY_PROBE_LEN);
        if bytes[..probe_len].contains(&0u8) {
            return Err(TaskContentError::BinaryDetected {
                probe: Self::BINARY_PROBE_LEN,
            });
        }
        Ok(Self(content))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }

    pub fn into_string(self) -> String {
        self.0
    }

    /// `CreateTaskIntent` から frontmatter + body を組み立てて `TaskContent` を
    /// 構築する factory。サイズ超過 / NUL byte は `CreateTaskError::ContentNotScannerEligible`
    /// に詰め直す。
    pub fn from_intent(
        intent: &CreateTaskIntent,
        resolved_parent_path: Option<&str>,
        normalized_links: &[String],
    ) -> Result<Self, CreateTaskError> {
        let raw = render_markdown_from_intent(intent, resolved_parent_path, normalized_links);
        Self::try_new(raw).map_err(|err| match err {
            TaskContentError::TooLarge { size, .. } => CreateTaskError::ContentNotScannerEligible {
                reason: ContentRejectReason::TooLarge { size },
            },
            TaskContentError::BinaryDetected { .. } => CreateTaskError::ContentNotScannerEligible {
                reason: ContentRejectReason::BinaryDetected,
            },
        })
    }
}

fn render_markdown_from_intent(
    intent: &CreateTaskIntent,
    resolved_parent_path: Option<&str>,
    normalized_links: &[String],
) -> String {
    use serde_yaml_ng::{Mapping, Value};

    let mut extras = Mapping::new();
    extras.insert(
        Value::String("title".into()),
        Value::String(intent.title.as_str().to_string()),
    );
    extras.insert(
        Value::String("status".into()),
        Value::String(intent.status.as_str().to_string()),
    );
    if let Some(parent_path) = resolved_parent_path {
        extras.insert(
            Value::String("parent".into()),
            Value::String(parent_path.to_string()),
        );
    }

    let frontmatter = Frontmatter {
        priority: intent.priority,
        labels: intent.labels.iter().map(|l| l.to_string()).collect(),
        links: normalized_links.to_vec(),
        extras,
    };

    let body = match intent.body.as_deref() {
        Some(b) if !b.is_empty() => format!("\n{b}"),
        _ => String::new(),
    };

    serialize_frontmatter(&Parsed { frontmatter, body })
}

impl fmt::Display for TaskContent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
#[path = "task_content_tests.rs"]
mod task_content_tests;
