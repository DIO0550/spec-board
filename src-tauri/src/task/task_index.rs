//! Task aggregate ドメイン。
//!
//! `Task` entity と `TaskIndex` aggregate root を同居させる。`TaskIndex` の
//! 不変条件（parent 存在 / 親チェーンに循環なし / 親チェーン深さ ≤ MAX）と
//! それを検証するロジックは、DDD 戦術的パターンに従い aggregate root の責務
//! としてこのファイルに集約する（独立した「validation」ファイルは作らない）。

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::config::column_name::ColumnName;
use crate::task::children::build_children;
use crate::task::frontmatter::Priority;
use crate::task::label::Label;
use crate::task::parse::TaskParseError;
use crate::task::path_lookup::{
    normalize_link_path_for_lookup, normalize_parent_path_for_lookup,
    normalize_task_path_for_lookup, parent_lookup_index, task_path_index,
};
use crate::task::reverse_links::build_reverse_links;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_title::TaskTitle;
use crate::task::warning::{TaskWarning, TaskWarningCode};

const MAX_PARENT_DEPTH: usize = 20;

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

/// 親チェーン違反の理由（循環 / 深さ超過）。
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

/// 新規 task に対する `TaskIndex` の検証メソッドが返す失敗値。
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

/// Task 集合の整合性（parent 存在 / 循環検出 / children・reverse_links 派生）を
/// 守る Aggregate。不変条件の検証メソッドを集約する。
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

    /// parent 参照の存在のみを検証し、見つからない場合は warning を追加する。
    pub fn validate_parent_existence(self) -> Self {
        Self {
            tasks: validate_parent_existence(self.tasks),
        }
    }

    /// parent 存在 + 循環 + 深さ検証を行う。
    pub fn validate_parent_hierarchy(self) -> Result<Self, TaskParseError> {
        Ok(Self {
            tasks: validate_parent_hierarchy(self.tasks)?,
        })
    }

    /// 親検証を行ったうえで各 Task の `children` を逆引きで構築する。
    pub fn build_children(self) -> Result<Self, TaskParseError> {
        Ok(Self {
            tasks: build_children(self.tasks)?,
        })
    }

    /// 各 Task の `links` を逆引きして `reverse_links` を構築する。
    pub fn build_reverse_links(self) -> Self {
        Self {
            tasks: build_reverse_links(self.tasks),
        }
    }

    /// 新規 task が指す parent 文字列を既存 task 集合に対して解決する。
    pub fn resolve_parent_for_new_task(&self, parent: &str) -> Option<usize> {
        resolve_parent_for_new_task(parent, &self.tasks)
    }

    /// 起点 parent から末端へ 1 edge 追加した chain の循環/深さ超過を検出する。
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

// ---------------------------------------------------------------------------
// TaskIndex の不変条件を検証する sibling helper 群。
//
// `Vec<Task>` を直接受け取る形にしておくことで、aggregate を構築する前段の
// 段階（open_project の scan 直後など）や、children/reverse_links 派生処理が
// validate を委譲呼び出ししたい場面でも再利用できる。`pub(super)` で task
// ドメイン内に閉じ、task ドメイン外からは TaskIndex aggregate のメソッド経由
// でのみ呼び出す。
// ---------------------------------------------------------------------------

pub(super) fn validate_parent_existence(mut tasks: Vec<Task>) -> Vec<Task> {
    let task_paths = task_path_index(&tasks);

    for task in &mut tasks {
        append_parent_not_found_warning(task, &task_paths);
    }

    tasks
}

pub(super) fn validate_parent_hierarchy(tasks: Vec<Task>) -> Result<Vec<Task>, TaskParseError> {
    let tasks = validate_parent_existence(tasks);
    let parent_lookup = parent_lookup_index(&tasks);

    for task in &tasks {
        validate_parent_chain(task, &parent_lookup)?;
    }

    Ok(tasks)
}

pub(super) fn resolve_parent_for_new_task(parent: &str, tasks: &[Task]) -> Option<usize> {
    let normalized = normalize_parent_path_for_lookup(parent)?;
    tasks
        .iter()
        .position(|task| normalize_task_path_for_lookup(task.file_path.as_str()) == normalized)
}

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
    parent_lookup: &HashMap<String, Option<String>>,
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

fn find_task_mut<'a>(
    cache: &'a mut HashMap<PathBuf, Task>,
    normalized: &str,
) -> Option<&'a mut Task> {
    cache.get_mut(&PathBuf::from(normalized))
}

#[cfg(test)]
#[path = "task_index_tests.rs"]
mod task_index_tests;

#[cfg(test)]
#[path = "task_index_parent_chain_tests.rs"]
mod task_index_parent_chain_tests;
