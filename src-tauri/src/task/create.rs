//! `create_task` Tauri command の引数受け取り型・入力検証純粋関数群。
//!
//! 本モジュールは現時点では以下を提供する:
//! - [`CreateTaskArgs`][] : FE から受け取る引数 DTO
//! - [`CreateTaskError`][]: 入力検証エラー
//! - [`build_new_filename`][]: title と既存ファイル名集合からユニークな
//!   md ファイル名を生成する純粋関数
//! - [`validate_parent_for_new_task`][]: 新規タスクの parent 引数を既存タスク
//!   スナップショットに対して検証する純粋関数（存在 + 循環/深さ）
//!
//! `#[tauri::command]` シン本体・AppState 反映・FS 書込みは本モジュールには含まれず、
//! 後続 Issue で追加される（本モジュールの純粋関数を組み合わせて使う想定）。

use std::collections::HashSet;

use serde::Deserialize;
use spec_board_fs::task::kebab_case::to_kebab_case;
use spec_board_fs::task::unique_filename::build_unique_filename;
use thiserror::Error;

use super::index::{
    resolve_parent_for_new_task, validate_chain_from_parent, ParentHierarchyErrorReason, Task,
};

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
    /// 親タスクへのプロジェクトルート相対パス（例: `tasks/parent-task.md`）。
    /// `.md` 拡張子込みのパス文字列で受け取る前提
    /// （task-format-spec.md の `parent` フィールド仕様に準拠）。
    /// 存在 + 循環/深さの検証は [`validate_parent_for_new_task`] で行う。
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
    /// `parent` で指定されたパスが既存タスクと一致しない。
    /// 空文字 / 絶対パス / Windows drive prefix / 自己参照（新規タスクは未登録のため
    /// 自然にここに該当） / 単純な不一致 をすべて含む。
    #[error("親タスクが見つかりません: {parent}")]
    ParentNotFound { parent: String },
    /// `parent` 起点 chain に循環があるか、新規タスク 1 edge を加えた合計が
    /// 最大深さ（20）を超える。
    #[error("親タスクのチェーン検証に失敗しました ({parent}): {reason}")]
    ParentCycleOrTooDeep {
        parent: String,
        reason: ParentHierarchyErrorReason,
    },
}

/// title と既存ファイル名集合から、衝突しない md ファイル名を生成する。
///
/// # 引数
/// - `title`: タスクタイトル。`to_kebab_case` で kebab-case 化される。
/// - `existing_filenames`: 衝突判定に使う既存ファイル名集合。本関数の戻り値と
///   同じ形式（拡張子 `.md` 込み・ディレクトリ部分なしのファイル名文字列。
///   例: `"foo.md"` / `"タスク-1.md"`）が格納されている前提。
///   **`Task.file_path` は `tasks/foo.md` のような相対パスで保持されるため、
///   呼び出し側でどの範囲（同一ディレクトリ・全タスク・root 直下のみ等）から
///   ファイル名部分のみを抜き出して集合を構築するかを決める責務がある。**
///
/// # 戻り値
/// - `Ok(String)`: 拡張子 `.md` 付きのユニークなファイル名（例: `"fix-login-bug.md"` /
///   衝突時 `"fix-login-bug-1.md"`）。
/// - `Err(CreateTaskError::InvalidTitle)`: `title` が空、または kebab-case 化結果が空のとき。
///
/// # 仕様委譲
/// - kebab-case 化のルールは `to_kebab_case` の仕様に委譲する。具体的には
///   ASCII 文字を 1 つでも含む入力では英数字以外の ASCII 文字（スペース・記号・
///   `_` ・ `.` ・ `/` 等）が `-` 区切りに集約され、連続ハイフンは 1 個に圧縮、
///   ASCII 大文字は小文字化される。一方 ASCII 文字を 1 つも含まない入力は
///   入力をそのまま返す。
/// - 上記により、ASCII 込み入力に `/` が含まれていても結果に残らないが、
///   ASCII を含まない入力に非 ASCII の禁止文字（例: 全角スラッシュ `／`）が
///   混じると素通りし得る。ファイル書込み直前のパス検証は呼び出し側の責務。
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

/// 新規タスクの `parent` 引数を検証する純粋関数。
///
/// 検証内容:
/// 1. `parent = None` の場合は親なしとして `Ok(())`。
/// 2. `parent = Some(path)` の場合、`existing_tasks` の `file_path` と一致するか
///    （`./` 接頭辞や `\\` セパレータの正規化込み）。一致しなければ
///    [`CreateTaskError::ParentNotFound`] を返す（空文字 / 絶対パス / Windows drive prefix /
///    自己参照もここに含まれる）。
/// 3. parent 起点 chain に新規タスク 1 edge を追加した合計深さが
///    最大深さ（20）を超えないか・循環していないかを検証する。違反した場合は
///    [`CreateTaskError::ParentCycleOrTooDeep`] を返す。
///
/// @param parent FE から受け取った parent 文字列（`None` または `tasks/foo.md` 形式）。
/// @param existing_tasks `AppState.tasks_cache` のスナップショット。
/// @returns Ok(()) / `ParentNotFound` / `ParentCycleOrTooDeep`。
pub fn validate_parent_for_new_task(
    parent: Option<&str>,
    existing_tasks: &[Task],
) -> Result<(), CreateTaskError> {
    let Some(parent_str) = parent else {
        return Ok(());
    };

    let parent_index =
        resolve_parent_for_new_task(parent_str, existing_tasks).ok_or_else(|| {
            CreateTaskError::ParentNotFound {
                parent: parent_str.to_string(),
            }
        })?;

    validate_chain_from_parent(parent_index, existing_tasks).map_err(|reason| {
        CreateTaskError::ParentCycleOrTooDeep {
            parent: parent_str.to_string(),
            reason,
        }
    })
}

#[cfg(test)]
#[path = "create_tests.rs"]
mod create_tests;
