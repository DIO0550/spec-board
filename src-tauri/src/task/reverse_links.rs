//! reverse_links 派生ドメイン。
//!
//! 全 Task の `links` 配列を走査し、リンク先 Task の `reverse_links` に source path を
//! 追加する。

use std::collections::{HashMap, HashSet};

use crate::task::path_lookup::{normalize_link_path_for_lookup, task_lookup_index};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;

/// 全 Task の links を逆引きし、リンク先 Task の reverse_links を構築する。
pub(super) fn build_reverse_links(mut tasks: Vec<Task>) -> Vec<Task> {
    clear_reverse_links(&mut tasks);
    let task_index = task_lookup_index(&tasks);

    for source_index in 0..tasks.len() {
        append_reverse_links_from_source(source_index, &mut tasks, &task_index);
    }

    tasks
}

fn clear_reverse_links(tasks: &mut [Task]) {
    for task in tasks {
        task.clear_reverse_links_for_resolver();
    }
}

fn append_reverse_links_from_source(
    source_index: usize,
    tasks: &mut [Task],
    task_index: &HashMap<String, usize>,
) {
    let source_file_path = tasks[source_index].file_path().clone();
    let target_indices = reverse_link_target_indices(tasks[source_index].links(), task_index);

    for target_index in target_indices {
        tasks[target_index].push_reverse_link_for_resolver(source_file_path.clone());
    }
}

fn reverse_link_target_indices(
    links: &[TaskFilePath],
    task_index: &HashMap<String, usize>,
) -> Vec<usize> {
    let mut seen_targets = HashSet::new();
    let mut target_indices = Vec::new();

    for link in links {
        let Some(target_path) = normalize_link_path_for_lookup(link.as_str()) else {
            continue;
        };
        if !seen_targets.insert(target_path.clone()) {
            continue;
        }

        let Some(target_task_index) = task_index.get(&target_path).copied() else {
            continue;
        };
        target_indices.push(target_task_index);
    }

    target_indices
}

#[cfg(test)]
#[path = "reverse_links_tests.rs"]
mod reverse_links_tests;
