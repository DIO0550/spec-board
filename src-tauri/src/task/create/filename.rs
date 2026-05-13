//! 新規タスクのファイル名・配置ディレクトリ・既存ファイル名集合の決定ロジック。
//!
//! `build_new_filename` は既存 VO `TaskFileName::from_title` への薄い委譲。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::error::CreateTaskError;
use crate::task::task_file_name::{TaskFileName, TaskFileNameError};
use crate::task::task_index::Task;
use crate::task::task_title::TaskTitle;

/// `TaskFileName::from_title` への委譲。エラーは `CreateTaskError::InvalidTitle` に詰め直す。
pub fn build_new_filename(
    title: &TaskTitle,
    existing_filenames: &HashSet<String>,
) -> Result<TaskFileName, CreateTaskError> {
    TaskFileName::from_title(title, existing_filenames).map_err(|err| match err {
        TaskFileNameError::InvalidTitle => CreateTaskError::InvalidTitle,
        // VO 側の Empty / ContainsSeparator / NotMarkdown は from_title 経路では
        // 構造的に発生しないが、安全のため InvalidTitle に正規化する。
        _ => CreateTaskError::InvalidTitle,
    })
}

/// 親未指定なら `tasks`、指定ありなら親 Task の `file_path` の dirname。
pub(crate) fn resolve_target_dir(parent_index: Option<usize>, snapshot: &[Task]) -> PathBuf {
    match parent_index {
        Some(i) => {
            let p = Path::new(snapshot[i].file_path.as_str());
            p.parent().map(Path::to_path_buf).unwrap_or_default()
        }
        None => PathBuf::from("tasks"),
    }
}

/// `target_dir` 直下に存在する Task のファイル名集合を作る。
pub(crate) fn build_existing_filenames_in_dir(
    tasks: &[Task],
    target_dir: &Path,
) -> HashSet<String> {
    let mut out: HashSet<String> = HashSet::new();
    for task in tasks {
        let path = Path::new(task.file_path.as_str());
        let parent = path.parent().unwrap_or_else(|| Path::new(""));
        if parent != target_dir {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        out.insert(name.to_string());
    }
    out
}

/// `target_dir.join(filename)` 相当だが、`target_dir` が空の場合はルート直下扱いにする。
pub(crate) fn join_rel_path(target_dir: &Path, filename: &TaskFileName) -> PathBuf {
    if target_dir.as_os_str().is_empty() {
        PathBuf::from(filename.as_str())
    } else {
        target_dir.join(filename.as_str())
    }
}

#[cfg(test)]
#[path = "filename_tests.rs"]
mod filename_tests;
