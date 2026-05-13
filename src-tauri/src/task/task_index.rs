//! Task aggregate ドメイン。
//!
//! `Task` entity と `TaskIndex` aggregate root を同居させる。`TaskIndex` は parent
//! 検証 / children 派生 / reverse_links 派生といったドメインルールを sibling
//! モジュールへ委譲し、外部からは aggregate メソッド経由でのみ振る舞いを呼び出す。

use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::column_name::ColumnName;
use crate::task::children::build_children;
use crate::task::frontmatter::Priority;
use crate::task::label::Label;
use crate::task::parent_validation::{
    resolve_parent_for_new_task, validate_chain_from_parent, validate_parent_existence,
    validate_parent_hierarchy, ParentHierarchyErrorReason, ParentValidationFailure,
};
use crate::task::parse::TaskParseError;
use crate::task::path_lookup::{
    normalize_link_path_for_lookup, normalize_parent_path_for_lookup,
    normalize_task_path_for_lookup,
};
use crate::task::reverse_links::build_reverse_links;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_title::TaskTitle;
use crate::task::warning::TaskWarning;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: TaskFilePath,
    pub file_path: TaskFilePath,
    pub title: TaskTitle,
    pub status: ColumnName,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    pub labels: Vec<Label>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<TaskFilePath>,
    pub links: Vec<TaskFilePath>,
    pub children: Vec<TaskFilePath>,
    pub reverse_links: Vec<TaskFilePath>,
    pub body: String,
    /// Task struct の typed フィールド（title / status / priority / labels / parent /
    /// links）に該当しない frontmatter キーをそのまま保持する。FE 側で表示・編集される
    /// 拡張メタデータ（例: `assignee`, `due_date` 等）。
    /// key 順序を JSON シリアライズで安定させるため `BTreeMap` を採用。
    pub extras: BTreeMap<String, serde_json::Value>,
    pub warnings: Vec<TaskWarning>,
}

/// Task 集合の整合性（parent 存在 / 循環検出 / children・reverse_links 派生）を
/// 守る Aggregate。
#[derive(Debug, Clone, PartialEq)]
pub struct TaskIndex {
    tasks: Vec<Task>,
}

impl TaskIndex {
    pub fn new(tasks: Vec<Task>) -> Self {
        Self { tasks }
    }

    pub fn into_tasks(self) -> Vec<Task> {
        self.tasks
    }

    pub fn as_slice(&self) -> &[Task] {
        &self.tasks
    }

    pub fn validate_parent_existence(self) -> Self {
        Self {
            tasks: validate_parent_existence(self.tasks),
        }
    }

    pub fn validate_parent_hierarchy(self) -> Result<Self, TaskParseError> {
        Ok(Self {
            tasks: validate_parent_hierarchy(self.tasks)?,
        })
    }

    pub fn build_children(self) -> Result<Self, TaskParseError> {
        Ok(Self {
            tasks: build_children(self.tasks)?,
        })
    }

    pub fn build_reverse_links(self) -> Self {
        Self {
            tasks: build_reverse_links(self.tasks),
        }
    }

    pub fn resolve_parent_for_new_task(&self, parent: &str) -> Option<usize> {
        resolve_parent_for_new_task(parent, &self.tasks)
    }

    pub fn validate_chain_from_parent(
        &self,
        parent_index: usize,
    ) -> Result<(), ParentHierarchyErrorReason> {
        validate_chain_from_parent(parent_index, &self.tasks)
    }

    /// 新規 task の parent 文字列を検証し、解決済み index を返す。
    pub fn validate_new_parent(
        &self,
        parent: Option<&str>,
    ) -> Result<Option<usize>, ParentValidationFailure> {
        let Some(parent_str) = parent else {
            return Ok(None);
        };
        let idx = resolve_parent_for_new_task(parent_str, &self.tasks).ok_or_else(|| {
            ParentValidationFailure::NotFound {
                parent: parent_str.to_string(),
            }
        })?;
        validate_chain_from_parent(idx, &self.tasks).map_err(|reason| {
            ParentValidationFailure::ChainInvalid {
                parent: parent_str.to_string(),
                reason,
            }
        })?;
        Ok(Some(idx))
    }

    /// 既存 task 集合に new_task を仮想的に追加した状態で hierarchy を検証する。
    pub fn validate_with_new_task(
        &self,
        new_task: &Task,
        raw_parent_input: Option<&str>,
    ) -> Result<(), ParentValidationFailure> {
        let mut augmented: Vec<Task> = self.tasks.clone();
        augmented.push(new_task.clone());
        match validate_parent_hierarchy(augmented) {
            Ok(_) => Ok(()),
            Err(TaskParseError::CycleOrTooDeep { reason, .. }) => {
                Err(ParentValidationFailure::ChainInvalid {
                    parent: raw_parent_input.unwrap_or("").to_string(),
                    reason,
                })
            }
            Err(other) => {
                log::warn!("validate_with_new_task: unexpected error: {other}");
                Err(ParentValidationFailure::ChainInvalid {
                    parent: raw_parent_input.unwrap_or("").to_string(),
                    reason: ParentHierarchyErrorReason::Cycle,
                })
            }
        }
    }

    /// 差分追加: 新規 Task を cache に挿入し、親 `children` と link 先
    /// `reverse_links` を局所更新する。
    pub(crate) fn insert_new_task_into_cache(
        cache: &mut HashMap<PathBuf, Task>,
        mut new_task: Task,
    ) -> Task {
        let key = PathBuf::from(new_task.file_path.as_str());
        let new_normalized = normalize_task_path_for_lookup(new_task.file_path.as_str());

        // (A) outgoing: 親があれば親の children に append
        if let Some(parent_ref) = new_task.parent.as_ref() {
            if let Some(pn) = normalize_parent_path_for_lookup(parent_ref.as_str()) {
                if let Some(parent_task) = find_task_mut(cache, &pn) {
                    parent_task.children.push(new_task.file_path.clone());
                }
            }
        }

        // (B) outgoing: links 先 task の reverse_links に append（重複 target 除外）
        let mut seen_link_targets: HashSet<String> = HashSet::new();
        for link in new_task.links.clone() {
            let Some(normalized) = normalize_link_path_for_lookup(link.as_str()) else {
                continue;
            };
            if !seen_link_targets.insert(normalized.clone()) {
                continue;
            }
            if let Some(target_task) = find_task_mut(cache, &normalized) {
                target_task.reverse_links.push(new_task.file_path.clone());
            }
        }

        let mut existing_sorted: Vec<&Task> = cache.values().collect();
        existing_sorted.sort_by(|a, b| a.file_path.cmp(&b.file_path));

        // (C) incoming parent
        for existing in &existing_sorted {
            let Some(parent_ref) = existing.parent.as_ref() else {
                continue;
            };
            let Some(pn) = normalize_parent_path_for_lookup(parent_ref.as_str()) else {
                continue;
            };
            if pn == new_normalized {
                new_task.children.push(existing.file_path.clone());
            }
        }

        // (D) incoming links
        for existing in &existing_sorted {
            let mut seen_in_source: HashSet<String> = HashSet::new();
            for link in &existing.links {
                let Some(ln) = normalize_link_path_for_lookup(link.as_str()) else {
                    continue;
                };
                if !seen_in_source.insert(ln.clone()) {
                    continue;
                }
                if ln == new_normalized {
                    new_task.reverse_links.push(existing.file_path.clone());
                    break;
                }
            }
        }

        cache.insert(key, new_task.clone());
        new_task
    }
}

impl From<Vec<Task>> for TaskIndex {
    fn from(tasks: Vec<Task>) -> Self {
        Self::new(tasks)
    }
}

fn find_task_mut<'a>(
    cache: &'a mut HashMap<PathBuf, Task>,
    normalized: &str,
) -> Option<&'a mut Task> {
    cache.get_mut(&PathBuf::from(normalized))
}

#[cfg(test)]
#[path = "task_index_tests.rs"]
mod task_index_tests;
