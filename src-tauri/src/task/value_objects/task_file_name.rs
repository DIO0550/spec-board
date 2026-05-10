//! Task の md ファイル名を表す Value Object。
//!
//! `TaskTitle` から kebab-case 化 + 衝突回避サフィックス付与で構築する。
//! kebab-case 自体はドメイン概念ではないため、別 VO は設けず本 VO の
//! `from_title` 内で sub-crate `spec-board-fs` のヘルパを呼ぶ形で内部完結する。

use std::collections::HashSet;
use std::fmt;

use serde::Serialize;
use thiserror::Error;

use super::task_title::TaskTitle;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct TaskFileName(String);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TaskFileNameError {
    #[error("task file name must not be empty")]
    Empty,
    #[error("task file name must not contain path separator (got `{0}`)")]
    ContainsSeparator(String),
    #[error("task file name must end with .md (got `{0}`)")]
    NotMarkdown(String),
    #[error("title is empty or produced empty kebab base")]
    InvalidTitle,
}

impl TaskFileName {
    pub fn try_from_str(value: &str) -> Result<Self, TaskFileNameError> {
        if value.is_empty() {
            return Err(TaskFileNameError::Empty);
        }
        if value.contains('/') || value.contains('\\') {
            return Err(TaskFileNameError::ContainsSeparator(value.into()));
        }
        if !value.to_ascii_lowercase().ends_with(".md") {
            return Err(TaskFileNameError::NotMarkdown(value.into()));
        }
        Ok(Self(value.to_string()))
    }

    /// `TaskTitle` を kebab-case 化し、衝突回避サフィックスを付与した
    /// 一意な md ファイル名を生成する。
    /// 既存挙動: title から生成した kebab base が空の場合は `InvalidTitle` を返す。
    pub fn from_title(
        title: &TaskTitle,
        existing: &HashSet<String>,
    ) -> Result<Self, TaskFileNameError> {
        let base = spec_board_fs::task::kebab_case::to_kebab_case(title.as_str());
        if base.is_empty() {
            return Err(TaskFileNameError::InvalidTitle);
        }
        let raw =
            spec_board_fs::task::unique_filename::build_unique_filename(&base, "md", existing);
        Self::try_from_str(&raw)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

impl fmt::Display for TaskFileName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl PartialEq<&str> for TaskFileName {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

#[cfg(test)]
#[path = "task_file_name_tests.rs"]
mod task_file_name_tests;
