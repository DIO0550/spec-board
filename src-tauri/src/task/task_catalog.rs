//! resident task state の aggregate root。
//!
//! 不変条件（構築時と全 mutation 後に成立）:
//! 1. canonical identity（`CanonicalTaskPath::from_file_path`）が一意
//! 2. `tasks` は file_path 昇順で整列済み
//! 3. 派生値（children / reverse_links / graph warning）が全 task の frontmatter と整合
//!
//! 生成経路は [`TaskCatalog::resolve`]（disk 由来）だけで、raw `Vec<Task>` / `HashMap`
//! からは構築できない。

use std::collections::HashMap;

use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::parse::TaskParseError;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::{resolve_lenient_candidates, ParsedTask, Task, TaskIndex};

/// canonical resolver を通過し、identity が一意な resident task 集合。
#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct TaskCatalog {
    /// file_path 昇順。派生値は resolver 通過済み。
    tasks: Vec<Task>,
    /// canonical identity → `tasks` の添字。
    index: HashMap<CanonicalTaskPath, usize>,
}

/// 同じ canonical identity に正規化された候補のうち、採用されなかった側。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DuplicateTaskIdentity {
    pub(crate) identity: CanonicalTaskPath,
    /// 採用した候補の raw file_path（file_path 昇順で先頭）。
    pub(crate) kept: TaskFilePath,
    /// 採用しなかった候補の raw file_path。
    pub(crate) rejected: TaskFilePath,
}

/// [`TaskCatalog::resolve`] の結果。重複は catalog に入れず、呼び出し側が warning に変換する。
#[derive(Debug)]
pub(crate) struct TaskCatalogResolution {
    pub(crate) catalog: TaskCatalog,
    /// 入力順ではなく file_path 昇順で決まる（決定的）。
    pub(crate) duplicates: Vec<DuplicateTaskIdentity>,
}

impl TaskCatalog {
    /// parse-only candidate 集合から catalog を作る。
    ///
    /// candidate を raw file_path 昇順に整列してから canonical identity で先勝ち dedupe し、
    /// 残りを lenient resolver に通す。file_path が同じ文字列の candidate（parse 段階で
    /// 正規化された表記揺れ）は stable sort により**入力順**を保ち、先に来たものを採る。
    /// disk 由来の入力順は scanner がファイル名順で走査するため決定的。
    ///
    /// # Errors
    /// 親チェーンが深すぎるときだけ `TaskParseError` を返す（循環は warning に倒す）。
    pub(crate) fn resolve(
        mut candidates: Vec<ParsedTask>,
    ) -> Result<TaskCatalogResolution, TaskParseError> {
        candidates.sort_by(|a, b| a.file_path.as_str().cmp(b.file_path.as_str()));
        let mut kept_by_identity: HashMap<CanonicalTaskPath, TaskFilePath> = HashMap::new();
        let mut unique = Vec::with_capacity(candidates.len());
        let mut duplicates = Vec::new();
        for candidate in candidates {
            let identity = CanonicalTaskPath::from_file_path(&candidate.file_path);
            match kept_by_identity.get(&identity) {
                Some(kept) => duplicates.push(DuplicateTaskIdentity {
                    identity,
                    kept: kept.clone(),
                    rejected: candidate.file_path,
                }),
                None => {
                    kept_by_identity.insert(identity, candidate.file_path.clone());
                    unique.push(candidate);
                }
            }
        }
        let catalog = Self::from_unique_candidates(unique)?;
        Ok(TaskCatalogResolution {
            catalog,
            duplicates,
        })
    }

    /// identity が一意であることが分かっている candidate から catalog を作る（内部専用）。
    fn from_unique_candidates(candidates: Vec<ParsedTask>) -> Result<Self, TaskParseError> {
        let tasks = resolve_lenient_candidates(candidates)?;
        let index = tasks
            .iter()
            .enumerate()
            .map(|(position, task)| {
                (
                    CanonicalTaskPath::from_file_path(task.file_path()),
                    position,
                )
            })
            .collect();
        Ok(Self { tasks, index })
    }

    pub(crate) fn get(&self, identity: &CanonicalTaskPath) -> Option<&Task> {
        self.index
            .get(identity)
            .map(|&position| &self.tasks[position])
    }

    pub(crate) fn contains(&self, identity: &CanonicalTaskPath) -> bool {
        self.index.contains_key(identity)
    }

    /// file_path 昇順の task 列。
    pub(crate) fn iter(&self) -> impl Iterator<Item = &Task> {
        self.tasks.iter()
    }

    pub(crate) fn as_slice(&self) -> &[Task] {
        &self.tasks
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.tasks.len()
    }

    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.tasks.is_empty()
    }

    /// query / plan 用の一時 view を作る。resident 由来の `TaskIndex` はここからしか作れない。
    pub(crate) fn to_index(&self) -> TaskIndex {
        TaskIndex::from_catalog(self)
    }

    pub(crate) fn into_tasks(self) -> Vec<Task> {
        self.tasks
    }

    /// resolver 通過済みの `Task` 群を candidate に戻して catalog にする（fixture 専用）。
    #[cfg(test)]
    pub(crate) fn from_tasks_for_test(tasks: impl IntoIterator<Item = Task>) -> Self {
        Self::resolve(
            tasks
                .into_iter()
                .map(|task| task.to_parsed_task())
                .collect(),
        )
        .expect("fixture tasks should resolve")
        .catalog
    }
}

#[cfg(test)]
#[path = "task_catalog_tests.rs"]
mod task_catalog_tests;
