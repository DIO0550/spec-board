//! `open_project` Tauri command の IPC 境界 (`path: String`) を application 層で
//! 詰め直す Intent 型。
//!
//! FE から渡される未検証文字列を `TryFrom<String>` で本 Intent に詰め直し、
//! 以降の effect 層 (`open_project_impl`) は `&OpenProjectIntent` のみを取る。
//! empty path の境界拒否はここで完結する。
//!
//! # 非 UTF-8 path の扱い
//!
//! 本 Intent は `String` 入力経由でのみ構築される。Rust の `String` は UTF-8
//! 確定であるため、`as_path_str()` が呼ばれる時点で内部 `raw` は常に UTF-8。
//! 非 UTF-8 path を IPC 境界から受け取るケースは型システムレベルで到達不能で
//! あり、`PathBuf::from(&str).to_str()` が失敗する経路も存在しない。将来
//! `From<OsString>` 等を追加する場合は別 API として設計する。
//!
//! # `raw: String` を保持する理由
//!
//! `OpenProjectError::DirectoryNotFound { path }` 等の Display 表示は FE 側
//! `TauriError.from` の正規表現分類に直結する。`ProjectRoot::Display`
//! (`to_string_lossy()`) で復元すると lossy 変換が混入する可能性があるため、
//! 元 `String` をそのまま保持して FE 互換を担保する。

use std::path::Path;

use crate::project::open::OpenProjectError;
use crate::project::project_root::ProjectRoot;

/// `open_project` の application 層エントリ。
///
/// 構築時に `root: ProjectRoot` が非空であることを保証する（empty path は
/// `TryFrom` で拒否済み）。effect 層は `as_path()` / `as_path_str()` で
/// `&Path` / `&str` を取り出し、既存 helper（`validate_directory` 等）に
/// 渡せる。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenProjectIntent {
    root: ProjectRoot,
    raw: String,
}

impl OpenProjectIntent {
    /// 内部の `ProjectRoot` を `&Path` として参照する。
    pub fn as_path(&self) -> &Path {
        self.root.as_path()
    }

    /// 内部 path を `&str` として参照する。
    ///
    /// 元 `String` をそのまま返すため `to_str()` を呼ばず構造的に成功する。
    pub fn as_path_str(&self) -> &str {
        &self.raw
    }

    /// 内部の `ProjectRoot` を消費して取り出す。
    pub fn into_root(self) -> ProjectRoot {
        self.root
    }

    /// 内部の `ProjectRoot` を参照する。
    pub fn root(&self) -> &ProjectRoot {
        &self.root
    }
}

impl TryFrom<String> for OpenProjectIntent {
    type Error = OpenProjectError;

    fn try_from(path: String) -> Result<Self, Self::Error> {
        // empty 判定は ProjectRoot::try_from_str に委譲し、Intent 層では
        // map_err で元 `path` を `DirectoryNotFound { path }` に詰め直す。
        // これにより empty 判定ロジックが二重実装にならない。
        let root = ProjectRoot::try_from_str(&path)
            .map_err(|_| OpenProjectError::DirectoryNotFound { path: path.clone() })?;
        Ok(Self { root, raw: path })
    }
}

#[cfg(test)]
#[path = "intent_tests.rs"]
mod intent_tests;
