//! `create_task` Tauri command の引数受け取り型とファイル名生成純粋関数。
//!
//! 本モジュールは現時点では以下のみを提供する:
//! - [`CreateTaskArgs`][] : FE から受け取る引数 DTO
//! - [`CreateTaskError`][]: 入力検証エラー
//! - [`build_new_filename`][]: title と既存ファイル名集合からユニークな
//!   md ファイル名を生成する純粋関数
//!
//! `#[tauri::command]` シン本体・AppState 反映・FS 書込み・parent 検証は
//! 本モジュールには含まれず、後続 Issue で追加される。

use std::collections::HashSet;

use serde::Deserialize;
use spec_board_fs::kebab_case::to_kebab_case;
use spec_board_fs::unique_filename::build_unique_filename;
use thiserror::Error;

/// `create_task` Tauri command の引数 DTO。
///
/// FE 側 invoke の camelCase キーと整合させるため
/// `#[serde(rename_all = "camelCase")]` を付与する。
/// `priority` は本Issue では文字列のまま保持し、値域検証は後続Issue で行う。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskArgs {
    /// タスクタイトル（必須）。空文字列は [`CreateTaskError::InvalidTitle`] となる。
    pub title: String,
    /// ステータス文字列（必須）。値域検証は本Issue では行わない。
    pub status: String,
    /// 優先度文字列。`"High" | "Medium" | "Low"` 想定だが本Issue では検証しない。
    pub priority: Option<String>,
    /// ラベル一覧。未指定時は空配列。
    #[serde(default)]
    pub labels: Vec<String>,
    /// 親タスクファイル名（拡張子なし想定）。存在検証・循環検証は後続Issue で実装。
    pub parent: Option<String>,
    /// 本文（Markdown）。未指定時は空文字列扱い。
    pub body: Option<String>,
}

/// `create_task` の入力検証エラー。
///
/// FE 側 `TauriError.PATTERNS` に意図的に引っかからない Display 文字列を採用し、
/// FE では UNKNOWN 分類となる前提（後続Issue で必要なら PATTERNS を整備）。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum CreateTaskError {
    /// `title` が空、または `to_kebab_case(title)` の結果が空文字列となるケース。
    #[error("タイトルからファイル名を生成できません")]
    InvalidTitle,
}

/// title と既存ファイル名集合から、衝突しない md ファイル名を生成する。
///
/// # 引数
/// - `title`: タスクタイトル。`to_kebab_case` で kebab-case 化される。
/// - `existing_filenames`: 衝突判定に使う既存ファイル名集合。**この集合の中身が
///   「プロジェクトルート直下の md ファイル名のみ」かどうかは本関数の関知外**であり、
///   呼び出し側の責務。
///
/// # 戻り値
/// - `Ok(String)`: 拡張子 `.md` 付きのユニークなファイル名（例: `"fix-login-bug.md"` /
///   衝突時 `"fix-login-bug-1.md"`）。
/// - `Err(CreateTaskError::InvalidTitle)`: `title` が空、または kebab-case 化結果が空のとき。
///
/// # 仕様委譲
/// - kebab-case 化のルール（記号区切り、連続ハイフン圧縮、CJK 入力時のスルー等）は
///   `to_kebab_case` の仕様に委譲する。よって CJK 入力にスラッシュ等が含まれても
///   本関数では検出しない（ファイル書込み直前のパス検証は呼び出し側の責務）。
/// - 連番サフィックス（`-1`, `-2`, ...）の付与規則は `build_unique_filename` の仕様に委譲する。
pub fn build_new_filename(
    title: &str,
    existing_filenames: &HashSet<String>,
) -> Result<String, CreateTaskError> {
    let base = to_kebab_case(title);
    if base.is_empty() {
        return Err(CreateTaskError::InvalidTitle);
    }
    Ok(build_unique_filename(&base, "md", existing_filenames))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set_of(items: &[&str]) -> HashSet<String> {
        items.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn build_new_filename_ascii_no_collision_cases() {
        let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
            (
                "Fix Login Bug",
                vec![],
                "fix-login-bug.md",
                "ascii basic / empty existing",
            ),
            (
                "Refactor API",
                vec!["other.md"],
                "refactor-api.md",
                "ascii basic / non-colliding existing",
            ),
        ];
        for (title, existing, expected, label) in cases {
            let existing = set_of(&existing);
            let actual = build_new_filename(title, &existing).expect(label);
            assert_eq!(actual, expected, "{label}");
        }
    }

    #[test]
    fn build_new_filename_ascii_collision_cases() {
        let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
            (
                "Fix Login Bug",
                vec!["fix-login-bug.md"],
                "fix-login-bug-1.md",
                "single collision",
            ),
            (
                "x",
                vec!["x.md", "x-1.md", "x-2.md"],
                "x-3.md",
                "consecutive collisions",
            ),
        ];
        for (title, existing, expected, label) in cases {
            let existing = set_of(&existing);
            let actual = build_new_filename(title, &existing).expect(label);
            assert_eq!(actual, expected, "{label}");
        }
    }

    #[test]
    fn build_new_filename_non_ascii_cases() {
        let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
            ("バグ修正", vec![], "バグ修正.md", "pure CJK / no collision"),
            (
                "タスク",
                vec!["タスク.md"],
                "タスク-1.md",
                "pure CJK / single collision",
            ),
            (
                "タスク",
                vec!["タスク.md", "タスク-1.md"],
                "タスク-2.md",
                "pure CJK / consecutive collisions",
            ),
            (
                "タスク 1",
                vec!["タスク-1.md"],
                "タスク-1-1.md",
                "mixed CJK + ASCII / numeric suffix base collision",
            ),
        ];
        for (title, existing, expected, label) in cases {
            let existing = set_of(&existing);
            let actual = build_new_filename(title, &existing).expect(label);
            assert_eq!(actual, expected, "{label}");
        }
    }

    #[test]
    fn build_new_filename_invalid_title_cases() {
        let cases: Vec<(&str, &str)> = vec![
            ("", "empty title"),
            ("   ", "ASCII whitespace only"),
            ("!!!", "symbols only (kebab result empty)"),
        ];
        for (title, label) in cases {
            let existing: HashSet<String> = HashSet::new();
            let actual = build_new_filename(title, &existing);
            assert_eq!(actual, Err(CreateTaskError::InvalidTitle), "{label}");
        }
    }
}
