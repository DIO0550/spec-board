//! Task の path 引き当てに使う lookup helper。
//!
//! `task::path_normalization` の string-level helper を、Task slice を引数に取る
//! 上位 helper にラップする。task ドメイン外には公開せず（`pub(super)`）、
//! 外部からは `TaskIndex` aggregate のメソッド経由でのみ間接利用する。

use std::collections::{HashMap, HashSet};

use crate::task::path_normalization::{has_windows_drive_prefix, normalize_path_parts};
use crate::task::task_index::Task;

pub(super) fn normalize_task_path_for_lookup(path: &str) -> String {
    let path_text = path.replace('\\', "/");
    normalize_path_parts(&path_text, true)
}

pub(super) fn normalize_parent_path_for_lookup(parent: &str) -> Option<String> {
    if parent.is_empty() || parent.starts_with('/') || parent.starts_with('\\') {
        return None;
    }
    if has_windows_drive_prefix(parent) {
        return None;
    }

    let path_text = parent.replace('\\', "/");
    let normalized = normalize_path_parts(&path_text, false);
    if normalized.is_empty() {
        return None;
    }

    Some(normalized)
}

pub(super) fn normalize_link_path_for_lookup(link: &str) -> Option<String> {
    normalize_parent_path_for_lookup(link)
}

/// command 層（IPC args）から渡されるユーザ入力 path を、parent lookup と同じ
/// 基準で軽量正規化する。
///
/// 既存 `normalize_parent_path_for_lookup` と異なり drive prefix (`C:`) も除去し、
/// 入力の空 / `/` / `\` 始まり / drive prefix は `None` にする。
pub(crate) fn normalize_relative_path_for_input(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.starts_with('/') || raw.starts_with('\\') {
        return None;
    }
    if has_windows_drive_prefix(raw) {
        return None;
    }
    let path_text = raw.replace('\\', "/");
    let normalized = normalize_path_parts(&path_text, true);
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub(super) fn task_path_index(tasks: &[Task]) -> HashSet<String> {
    tasks
        .iter()
        .map(|task| normalize_task_path_for_lookup(task.file_path.as_str()))
        .collect()
}

pub(super) fn parent_lookup_index(tasks: &[Task]) -> HashMap<String, Option<String>> {
    tasks
        .iter()
        .map(|task| {
            (
                normalize_task_path_for_lookup(task.file_path.as_str()),
                task.parent
                    .as_ref()
                    .and_then(|p| normalize_parent_path_for_lookup(p.as_str())),
            )
        })
        .collect()
}

pub(super) fn task_lookup_index(tasks: &[Task]) -> HashMap<String, usize> {
    tasks
        .iter()
        .enumerate()
        .map(|(index, task)| {
            (
                normalize_task_path_for_lookup(task.file_path.as_str()),
                index,
            )
        })
        .collect()
}

pub(super) fn clear_children(tasks: &mut [Task]) {
    for task in tasks {
        task.children.clear();
    }
}

pub(super) fn append_child_to_parent(
    child_index: usize,
    tasks: &mut [Task],
    parent_index: &HashMap<String, usize>,
) {
    let child_file_path = tasks[child_index].file_path.clone();
    let Some(parent_path) = tasks[child_index]
        .parent
        .as_ref()
        .and_then(|p| normalize_parent_path_for_lookup(p.as_str()))
    else {
        return;
    };

    let Some(parent_task_index) = parent_index.get(&parent_path).copied() else {
        return;
    };

    let children = &mut tasks[parent_task_index].children;
    children.push(child_file_path);
}
