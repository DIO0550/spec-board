//! プロジェクトルートディレクトリの絶対 / 相対パスを表す Value Object。
//!
//! IPC 境界の DTO として直接利用するのではなく、`OpenProjectIntent` の内部で
//! `try_from_str` により詰め直される VO として扱う。`open_project` Tauri
//! command は引数 `path: String` を `OpenProjectIntent::try_from(path)` に渡し、
//! Intent 構築時に本 VO への変換と empty path 拒否がまとめて行われる。
//! 以降の effect 層 (`open_project_impl`) は `&OpenProjectIntent` のみを取る。
//!
//! serde 不要（FE → Rust の引数として直接 deserialize されることはなく、
//! Intent 経由で明示的に変換するため）。

use std::fmt;
use std::path::{Path, PathBuf};

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProjectRoot(PathBuf);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ProjectRootError {
    #[error("project root path must not be empty")]
    Empty,
}

impl ProjectRoot {
    /// 文字列から VO を構築する。空文字のみ拒否し、実在性は別途検証する。
    pub fn try_from_str(value: &str) -> Result<Self, ProjectRootError> {
        if value.is_empty() {
            return Err(ProjectRootError::Empty);
        }
        Ok(Self(PathBuf::from(value)))
    }

    pub fn from_path_buf(path: PathBuf) -> Result<Self, ProjectRootError> {
        if path.as_os_str().is_empty() {
            return Err(ProjectRootError::Empty);
        }
        Ok(Self(path))
    }

    pub fn as_path(&self) -> &Path {
        self.0.as_path()
    }

    pub fn into_path_buf(self) -> PathBuf {
        self.0
    }

    pub fn as_path_buf(&self) -> &PathBuf {
        &self.0
    }
}

impl AsRef<Path> for ProjectRoot {
    fn as_ref(&self) -> &Path {
        self.as_path()
    }
}

impl fmt::Display for ProjectRoot {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0.to_string_lossy())
    }
}

#[cfg(test)]
#[path = "project_root_tests.rs"]
mod project_root_tests;
