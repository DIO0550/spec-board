//! Task の相対 file path を表す Value Object。
//!
//! strict / lenient の 2 系統コンストラクタを提供する:
//! - strict (`try_from_str` / `from_relative_path`): scanner 由来の自身 path 用
//! - lenient (`from_lenient`): frontmatter 由来の `parent` / `links` 用
//!
//! 既存の `Task.parent` / `Task.links` 等は YAML deserialize から空文字や
//! dot prefix を保持して後段の graph builder で warning に落とす振る舞いを
//! 守る必要があるため、custom `Deserialize` は lenient 系統を呼ぶ。

use std::fmt;
use std::path::{Path, PathBuf};

use serde::Serialize;
use thiserror::Error;

use crate::task::path_normalization::normalize_path_parts;

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct TaskFilePath(String);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TaskFilePathError {
    #[error("task file path must not be empty")]
    Empty,
    #[error("task file path must end with .md (got `{0}`)")]
    NotMarkdown(String),
    #[error("task file path must use forward-slash separators (got `{0}`)")]
    BackslashNotAllowed(String),
    #[error("task file path must not have leading/trailing slash (got `{0}`)")]
    LeadingOrTrailingSlash(String),
}

impl TaskFilePath {
    /// strict コンストラクタ。canonical な相対パス（scanner 由来）の検証用。
    pub fn try_from_str(value: &str) -> Result<Self, TaskFilePathError> {
        if value.is_empty() {
            return Err(TaskFilePathError::Empty);
        }
        if value.contains('\\') {
            return Err(TaskFilePathError::BackslashNotAllowed(value.into()));
        }
        if value.starts_with('/') || value.ends_with('/') {
            return Err(TaskFilePathError::LeadingOrTrailingSlash(value.into()));
        }
        let lower = value.to_ascii_lowercase();
        if !lower.ends_with(".md") {
            return Err(TaskFilePathError::NotMarkdown(value.into()));
        }
        Ok(Self(value.to_string()))
    }

    /// scanner 由来の `&Path` から strict 構築する。
    /// `normalize_path_parts(_, true)` で既存 `normalized_task_file_path` と
    /// 同一の正規化（`\\` → `/`、空要素・`.`・drive prefix 除去）を行ったうえで
    /// strict 検証を通す。
    pub fn from_relative_path(path: &Path) -> Result<Self, TaskFilePathError> {
        let raw = path.to_string_lossy().replace('\\', "/");
        let normalized = normalize_path_parts(&raw, true);
        Self::try_from_str(&normalized)
    }

    /// lenient コンストラクタ。frontmatter 由来の `parent` / `links` などで、
    /// 既存挙動（空文字保持・backslash 置換・拡張子問わない・dot prefix 保持）
    /// を維持する。検証は呼び出し側 graph builder 等で行う。
    pub fn from_lenient<S: Into<String>>(value: S) -> Self {
        let raw = value.into();
        let normalized = raw.replace('\\', "/");
        Self(normalized)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }

    pub fn as_path_buf(&self) -> PathBuf {
        PathBuf::from(&self.0)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'de> serde::Deserialize<'de> for TaskFilePath {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(de)?;
        Ok(Self::from_lenient(raw))
    }
}

impl From<&str> for TaskFilePath {
    fn from(value: &str) -> Self {
        Self::from_lenient(value.to_string())
    }
}

impl From<String> for TaskFilePath {
    fn from(value: String) -> Self {
        Self::from_lenient(value)
    }
}

impl AsRef<str> for TaskFilePath {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for TaskFilePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl PartialEq<&str> for TaskFilePath {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

impl PartialEq<TaskFilePath> for &str {
    fn eq(&self, other: &TaskFilePath) -> bool {
        *self == other.0
    }
}

impl PartialEq<TaskFilePath> for str {
    fn eq(&self, other: &TaskFilePath) -> bool {
        self == other.0
    }
}

impl PartialEq<String> for TaskFilePath {
    fn eq(&self, other: &String) -> bool {
        &self.0 == other
    }
}

impl PartialEq<TaskFilePath> for String {
    fn eq(&self, other: &TaskFilePath) -> bool {
        self == &other.0
    }
}

#[cfg(test)]
#[path = "task_file_path_tests.rs"]
mod task_file_path_tests;
