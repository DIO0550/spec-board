//! Task title を表す Value Object。
//!
//! 既存 `extract_title` (`task/index.rs`) は **`title.is_empty()` のみ invalid**
//! として扱い、`"   "` (whitespace-only) は valid title として保持する。
//! 本 VO もこの挙動を踏襲する（仕様変更を起こさない）。

use std::fmt;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct TaskTitle(String);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TaskTitleError {
    #[error("task title must not be empty")]
    Empty,
}

impl TaskTitle {
    /// strict: 空文字のみ拒否。whitespace-only は valid。末尾改行は trim する。
    pub fn try_from_str(value: &str) -> Result<Self, TaskTitleError> {
        let trimmed = value.trim_end_matches('\n');
        if trimmed.is_empty() {
            return Err(TaskTitleError::Empty);
        }
        Ok(Self(trimmed.to_string()))
    }

    /// lenient: 空文字も保持。custom Deserialize / file-name fallback 用。
    pub fn from_lenient<S: Into<String>>(value: S) -> Self {
        let raw = value.into();
        let trimmed = raw.trim_end_matches('\n').to_string();
        Self(trimmed)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'de> serde::Deserialize<'de> for TaskTitle {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        Ok(Self::from_lenient(String::deserialize(de)?))
    }
}

impl From<&str> for TaskTitle {
    fn from(value: &str) -> Self {
        Self::from_lenient(value.to_string())
    }
}

impl From<String> for TaskTitle {
    fn from(value: String) -> Self {
        Self::from_lenient(value)
    }
}

impl fmt::Display for TaskTitle {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl PartialEq<&str> for TaskTitle {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

impl PartialEq<TaskTitle> for &str {
    fn eq(&self, other: &TaskTitle) -> bool {
        *self == other.0
    }
}

impl PartialEq<TaskTitle> for str {
    fn eq(&self, other: &TaskTitle) -> bool {
        self == other.0
    }
}

impl PartialEq<String> for TaskTitle {
    fn eq(&self, other: &String) -> bool {
        &self.0 == other
    }
}

impl PartialEq<TaskTitle> for String {
    fn eq(&self, other: &TaskTitle) -> bool {
        self == &other.0
    }
}

#[cfg(test)]
#[path = "task_title_tests.rs"]
mod task_title_tests;
