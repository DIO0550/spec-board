//! IPC command の引数として渡されるユーザ入力 path を、project_root 相対の
//! 正規形へ倒すための入力パス VO。
//!
//! add_link / remove_link / update_task の各 args DTO がほぼ同一の正規化・検証
//! （空拒否・絶対パスの root 相対化・`..` 拒否・必要なら `.md` 検証）を行っていた
//! ため、その共通知識をここに集約する。各 command はこの VO の reject を自身の
//! エラー型へ詰め替えるだけにする。

use std::path::{Component, Path, PathBuf};

use crate::task::path_lookup::normalize_relative_path_for_input;

/// 入力 path の正規化・検証に失敗したことを表す marker。
///
/// どの検証段階で失敗したかを呼び出し元へ伝える必要はなく（各 command は失敗を
/// 単一のエラー variant へ畳み込むため）、reject は値を持たない。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InputPathRejected;

/// IPC 入力 path を project_root 相対の正規形へ倒した結果を表す VO。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InputTaskPath(PathBuf);

impl InputTaskPath {
    /// `raw` を project_root 相対の正規 path へ解決する。
    ///
    /// - 空文字 / 空白のみは reject する。
    /// - 絶対パスは `project_root` を strip して相対化し、root 外なら reject する。
    /// - `.` や余分な区切り、Windows drive prefix を除去して正規化する。
    /// - `..`（親ディレクトリ参照）を含む場合は reject する。
    /// - 正規化の結果が空になる場合は reject する。
    /// - `require_md_extension` が `true` の場合、拡張子が `.md` でなければ reject する。
    ///   判定は scanner（`spec_board_fs::task::file_scanner`）と同じく大文字小文字を
    ///   区別しない。区別すると `.MD` のファイルが「一覧には出るが操作できない」
    ///   タスクになってしまう。
    pub fn resolve(
        raw: &str,
        project_root: &Path,
        require_md_extension: bool,
    ) -> Result<Self, InputPathRejected> {
        if raw.trim().is_empty() {
            return Err(InputPathRejected);
        }

        let candidate_text = if Path::new(raw).is_absolute() {
            Path::new(raw)
                .strip_prefix(project_root)
                .map_err(|_| InputPathRejected)?
                .to_string_lossy()
                .into_owned()
        } else {
            raw.to_string()
        };

        let normalized =
            normalize_relative_path_for_input(&candidate_text).ok_or(InputPathRejected)?;
        let rel = Path::new(&normalized);

        if rel.components().any(|c| matches!(c, Component::ParentDir)) {
            return Err(InputPathRejected);
        }

        if rel.as_os_str().is_empty() {
            return Err(InputPathRejected);
        }

        if require_md_extension && !has_md_extension(rel) {
            return Err(InputPathRejected);
        }

        Ok(Self(rel.to_path_buf()))
    }

    /// 正規化済みの project_root 相対 path を取り出す。
    pub fn into_path_buf(self) -> PathBuf {
        self.0
    }
}

/// 拡張子が `.md` かどうかを大文字小文字を区別せず判定する。
fn has_md_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
}

#[cfg(test)]
#[path = "input_task_path_tests.rs"]
mod input_task_path_tests;
