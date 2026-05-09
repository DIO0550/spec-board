//! `get_tasks` Tauri command 本体。
//!
//! `AppState.tasks_cache` に格納済みの `Task` 一覧を `id` 昇順でクローンして返す
//! 純粋な読み取り専用 command。`open_project` で commit された state を消費する
//! 後続 API としての位置付け。
//!
//! # 構成
//!
//! - `GetTasksError`: FE へ返すエラー（`StateLockPoisoned` のみ）
//! - `get_tasks`: `#[tauri::command]` シン
//! - `get_tasks_impl`: 単体テストの境界となる本体関数
//!
//! # エラー文字列の契約
//!
//! `StateLockPoisoned` の Display は `"内部状態のロックが破損しました"` で、
//! `OpenProjectError::StateLockPoisoned` と完全一致させる。FE 側
//! `TauriError.PATTERNS` 未対応のため `UNKNOWN` 分類になる。

use tauri::State;
use thiserror::Error;

use crate::state::{AppState, AppStateError};
use crate::task_index::Task;

/// `get_tasks` コマンドのエラー。
///
/// `tasks_cache` の lock 取得時に poison が確定している場合のみ返る。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum GetTasksError {
    /// `AppState` 内部 mutex (`tasks_cache`) が poison 状態。
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
}

impl From<AppStateError> for GetTasksError {
    fn from(_: AppStateError) -> Self {
        GetTasksError::StateLockPoisoned
    }
}

/// Tauri command 薄層。`get_tasks_impl` を呼び、エラーを文字列化して返す。
///
/// 戻り値の `Result<_, String>` の Err 文字列は `GetTasksError` の Display 文字列。
///
/// # Errors
///
/// `tasks_cache` の `Mutex` が poison している場合に
/// `"内部状態のロックが破損しました"` を返す。
#[tauri::command]
pub fn get_tasks(state: State<'_, AppState>) -> Result<Vec<Task>, String> {
    get_tasks_impl(state.inner()).map_err(|e| e.to_string())
}

/// 単体テスト境界の本体関数。
///
/// `AppState::tasks_snapshot` で `Vec<Task>` を取得し、`id` 昇順 sort して返す。
/// `tasks_cache` が空の場合は空 Vec をそのまま返す（未 open ケースを成功扱い）。
///
/// # Errors
///
/// `tasks_cache` の `Mutex` が poison している場合に
/// `GetTasksError::StateLockPoisoned` を返す。
pub(crate) fn get_tasks_impl(state: &AppState) -> Result<Vec<Task>, GetTasksError> {
    let mut tasks = state.tasks_snapshot()?;
    tasks.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(tasks)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;

    use tempfile::TempDir;

    use super::*;
    use crate::open_project::open_project_impl;

    fn tempdir() -> TempDir {
        tempfile::tempdir().expect("create temp dir")
    }

    fn write_md(root: &Path, rel: &str, body: &str) {
        let absolute = root.join(rel);
        if let Some(parent) = absolute.parent() {
            fs::create_dir_all(parent).expect("create parent dir");
        }
        fs::write(&absolute, body).expect("write md");
    }

    fn task_md(title: &str, status: &str, parent: Option<&str>) -> String {
        task_md_with_links(title, status, parent, &[])
    }

    fn task_md_with_links(
        title: &str,
        status: &str,
        parent: Option<&str>,
        links: &[&str],
    ) -> String {
        let mut s = String::from("---\n");
        s.push_str(&format!("title: {title}\n"));
        s.push_str(&format!("status: {status}\n"));
        if let Some(p) = parent {
            s.push_str(&format!("parent: {p}\n"));
        }
        if !links.is_empty() {
            let joined = links
                .iter()
                .map(|l| format!("\"{l}\""))
                .collect::<Vec<_>>()
                .join(", ");
            s.push_str(&format!("links: [{joined}]\n"));
        }
        s.push_str("---\n\nbody\n");
        s
    }

    #[test]
    fn from_app_state_error_maps_to_state_lock_poisoned() {
        let converted: GetTasksError = AppStateError::LockPoisoned.into();
        assert_eq!(GetTasksError::StateLockPoisoned, converted);
    }

    #[test]
    fn state_lock_poisoned_display_matches_open_project_contract() {
        assert_eq!(
            "内部状態のロックが破損しました",
            GetTasksError::StateLockPoisoned.to_string()
        );
    }

    #[test]
    fn returns_empty_vec_when_app_state_is_uninitialized() {
        let state = AppState::new();

        let tasks = get_tasks_impl(&state).expect("should succeed even before open_project");

        assert!(tasks.is_empty());
    }

    #[test]
    fn returns_tasks_sorted_by_id_after_open_project() {
        let state = AppState::new();
        let dir = tempdir();
        write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
        write_md(
            dir.path(),
            "tasks/a.md",
            &task_md("A", "Todo", Some("tasks/b.md")),
        );
        let raw = dir.path().to_str().expect("utf-8").to_string();
        open_project_impl(&state, &raw).expect("open should succeed");

        let tasks = get_tasks_impl(&state).expect("get_tasks should succeed");

        let ids: Vec<&str> = tasks.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(vec!["tasks/a.md", "tasks/b.md"], ids);
    }

    #[test]
    fn preserves_children_and_reverse_links_built_by_open_project() {
        let state = AppState::new();
        let dir = tempdir();
        write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
        write_md(
            dir.path(),
            "tasks/a.md",
            &task_md_with_links("A", "Todo", Some("tasks/b.md"), &["tasks/b.md"]),
        );
        let raw = dir.path().to_str().expect("utf-8").to_string();
        open_project_impl(&state, &raw).expect("open should succeed");

        let tasks = get_tasks_impl(&state).expect("get_tasks should succeed");

        let task_a = tasks
            .iter()
            .find(|t| t.id == "tasks/a.md")
            .expect("task a exists");
        let task_b = tasks
            .iter()
            .find(|t| t.id == "tasks/b.md")
            .expect("task b exists");

        assert_eq!(vec!["tasks/a.md".to_string()], task_b.children);
        assert!(task_a.children.is_empty());

        assert_eq!(vec!["tasks/a.md".to_string()], task_b.reverse_links);
        assert!(task_a.reverse_links.is_empty());

        assert_eq!(vec!["tasks/b.md".to_string()], task_a.links);
    }
}
