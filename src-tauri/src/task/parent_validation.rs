//! parent 参照の存在検証、循環/深さ検証、新規 task 用 chain 検証を集めるドメイン。
//!
//! 自由関数は `pub(super)` に格下げし、task ドメイン外からは `TaskIndex` aggregate
//! のメソッド経由でのみ利用する。

use std::collections::HashSet;
use std::fmt;

use crate::task::parse::TaskParseError;
use crate::task::path_lookup::{
    normalize_parent_path_for_lookup, normalize_task_path_for_lookup, parent_lookup_index,
    task_path_index,
};
use crate::task::task_index::Task;
use crate::task::warning::{TaskWarning, TaskWarningCode};

const MAX_PARENT_DEPTH: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParentHierarchyErrorReason {
    Cycle,
    TooDeep,
}

impl fmt::Display for ParentHierarchyErrorReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Cycle => write!(f, "contains a cycle"),
            Self::TooDeep => write!(f, "exceeds the maximum depth"),
        }
    }
}

/// 新規 task の parent 検証で `TaskIndex` aggregate が返す失敗値。
/// `task::create::error::CreateTaskError` から `From` で変換される。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParentValidationFailure {
    NotFound {
        parent: String,
    },
    ChainInvalid {
        parent: String,
        reason: ParentHierarchyErrorReason,
    },
}

/// 全 Task の file_path に対して parent 参照の存在を検証する。
pub(super) fn validate_parent_existence(mut tasks: Vec<Task>) -> Vec<Task> {
    let task_paths = task_path_index(&tasks);

    for task in &mut tasks {
        append_parent_not_found_warning(task, &task_paths);
    }

    tasks
}

/// 全 Task の parent 参照に対して存在検証と循環/深さ検証を行う。
pub(super) fn validate_parent_hierarchy(tasks: Vec<Task>) -> Result<Vec<Task>, TaskParseError> {
    let tasks = validate_parent_existence(tasks);
    let parent_lookup = parent_lookup_index(&tasks);

    for task in &tasks {
        validate_parent_chain(task, &parent_lookup)?;
    }

    Ok(tasks)
}

/// 新規タスクが受け取る parent 文字列を正規化し、既存タスク群の中から index を解決する。
pub(super) fn resolve_parent_for_new_task(parent: &str, tasks: &[Task]) -> Option<usize> {
    let normalized = normalize_parent_path_for_lookup(parent)?;
    tasks
        .iter()
        .position(|task| normalize_task_path_for_lookup(task.file_path.as_str()) == normalized)
}

/// parent 起点に新規タスクを末端へ 1 edge 追加した chain の循環/深さ超過を検出する。
pub(super) fn validate_chain_from_parent(
    parent_index: usize,
    tasks: &[Task],
) -> Result<(), ParentHierarchyErrorReason> {
    let parent_task = tasks
        .get(parent_index)
        .expect("validate_chain_from_parent: parent_index must be in range (caller invariant)");
    let lookup = parent_lookup_index(tasks);
    let mut visited = HashSet::new();
    let mut current = normalize_task_path_for_lookup(parent_task.file_path.as_str());
    let mut depth: usize = 1;

    loop {
        if !visited.insert(current.clone()) {
            return Err(ParentHierarchyErrorReason::Cycle);
        }
        if depth > MAX_PARENT_DEPTH {
            return Err(ParentHierarchyErrorReason::TooDeep);
        }
        let Some(Some(next)) = lookup.get(&current) else {
            return Ok(());
        };
        depth += 1;
        current = next.clone();
    }
}

fn validate_parent_chain(
    task: &Task,
    parent_lookup: &std::collections::HashMap<String, Option<String>>,
) -> Result<(), TaskParseError> {
    let mut visited = HashSet::new();
    let origin = task.file_path.as_str().to_string();
    let mut current = normalize_task_path_for_lookup(task.file_path.as_str());
    let mut depth = 0;

    loop {
        if !visited.insert(current.clone()) {
            return Err(TaskParseError::CycleOrTooDeep {
                file_path: origin,
                reason: ParentHierarchyErrorReason::Cycle,
            });
        }

        let Some(Some(parent)) = parent_lookup.get(&current) else {
            return Ok(());
        };

        depth += 1;
        if depth > MAX_PARENT_DEPTH {
            return Err(TaskParseError::CycleOrTooDeep {
                file_path: origin,
                reason: ParentHierarchyErrorReason::TooDeep,
            });
        }

        current = parent.clone();
    }
}

fn append_parent_not_found_warning(task: &mut Task, task_paths: &HashSet<String>) {
    let Some(parent) = &task.parent else {
        return;
    };

    let Some(parent_lookup_path) = normalize_parent_path_for_lookup(parent.as_str()) else {
        push_parent_not_found(task);
        return;
    };

    if task_paths.contains(&parent_lookup_path) {
        return;
    }

    push_parent_not_found(task);
}

fn push_parent_not_found(task: &mut Task) {
    let already_exists = task.warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    });
    if already_exists {
        return;
    }

    task.warnings.push(TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".to_string()),
        message: "parent task was not found".to_string(),
    });
}

#[cfg(test)]
#[path = "parent_validation_tests.rs"]
mod parent_validation_tests;
