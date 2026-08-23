//! resident task cache のキーに使う canonical な相対 path の Value Object。
//!
//! cache は `HashMap<CanonicalTaskPath, Task>` として保持し、キーは必ず本 VO の
//! コンストラクタを通す。`\` → `/` 変換、空要素と `.` の除去、Windows drive
//! prefix の除去を通した表記だけが値として存在しうる。
//!
//! 生文字列から暗黙に変換されないよう `Borrow<str>` / `Deref` は実装しない。
//! 引き当て側も必ず同じコンストラクタを経由させ、「構築は raw・引き当ては正規化」
//! という非対称が再発しないようにする（#596）。
//!
//! 正規化の実体は pure helper `path_normalization` にのみ依存させる。
//! `path_lookup` は `Task` に依存するため、そちらを呼ぶと VO が Aggregate に
//! 依存する責務逆転になる。

use std::fmt;
use std::path::{Path, PathBuf};

use crate::task::path_normalization::normalize_path_parts;
use crate::task::task_file_path::TaskFilePath;

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct CanonicalTaskPath(String);

impl CanonicalTaskPath {
    /// 唯一の正規化コンストラクタ。
    ///
    /// 入力の表記（`./tasks/a.md` / `tasks\a.md` / `tasks/./a.md` / `C:/tasks/a.md`）に
    /// 関わらず、同じ canonical 表記 `tasks/a.md` を返す。冪等であり、既に canonical な
    /// 文字列を渡しても値は変わらない。
    ///
    /// drive prefix の除去は先頭セグメントがちょうど `C:` の形のときだけ働く。
    /// `C:tasks/a.md` は先頭セグメントが `C:tasks` なので畳まれず、そのまま残る
    /// （`path_normalization::is_drive_letter_segment`）。Unix で正規ディレクトリ名に
    /// なりうる `notes:` を誤削除しないための境界であり、本 VO でも据え置いている。
    ///
    /// @param raw 正規化前の path 文字列。
    /// @returns canonical 表記だけを保持する `CanonicalTaskPath`。
    pub fn new(raw: &str) -> Self {
        let path_text = raw.replace('\\', "/");
        Self(normalize_path_parts(&path_text, true))
    }

    /// `Task::file_path` から cache キーを導出する。
    ///
    /// @param file_path 対象 Task の相対 file path。
    /// @returns `file_path` を正規化した cache キー。
    pub fn from_file_path(file_path: &TaskFilePath) -> Self {
        Self::new(file_path.as_str())
    }

    /// IPC 引数などの `&Path` から cache キーを導出する。
    ///
    /// @param path 正規化前の相対 path。
    /// @returns `path` を正規化した cache キー。
    pub fn from_path(path: &Path) -> Self {
        Self::new(&path.to_string_lossy())
    }

    /// canonical 表記の文字列を借用で返す。
    ///
    /// @returns 正規化済みの path 文字列。
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// canonical 表記の文字列を所有権ごと取り出す。
    ///
    /// @returns 正規化済みの path 文字列。
    pub fn into_string(self) -> String {
        self.0
    }

    /// canonical 表記から `PathBuf` を組む。
    ///
    /// @returns 正規化済み path の `PathBuf` 表現。
    pub fn as_path_buf(&self) -> PathBuf {
        PathBuf::from(&self.0)
    }

    /// 値が空文字かを返す。
    ///
    /// @returns 正規化の結果が空文字の場合は `true`。
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl fmt::Display for CanonicalTaskPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
#[path = "canonical_task_path_tests.rs"]
mod canonical_task_path_tests;
