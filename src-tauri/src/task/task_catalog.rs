//! resident task state の aggregate root。
//!
//! 不変条件（構築時と全 mutation 後に成立）:
//! 1. canonical identity（`CanonicalTaskPath::from_file_path`）が一意
//! 2. `tasks` は file_path 昇順で整列済み
//! 3. 派生値（children / reverse_links / graph warning）が全 task の frontmatter と整合
//!
//! 生成経路は [`TaskCatalog::resolve`]（disk 由来）と [`TaskCatalog::apply`] /
//! [`TaskCatalog::apply_all`]（mutation）だけで、raw `Vec<Task>` / `HashMap` からは
//! 構築できない。

use std::collections::{BTreeMap, HashMap};

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

/// mutation command / watcher が catalog へ渡す candidate 変更 1 件。
///
/// watcher の rename は fs 層で `removed(from)` + `upserted(to)` へ分解され、mutation も
/// 書き込み前 plan を同じ upsert / remove で表すため、rename 専用 variant は持たない。
/// `ParsedTask` は `TaskFilePath` より大きいため、variant 間の差を抑える目的で
/// `Upserted` だけ box に載せる。
#[derive(Debug)]
pub(crate) enum TaskChange {
    /// 作成または更新。parse-only candidate で同一 identity の slot を差し替える。
    Upserted(Box<ParsedTask>),
    /// 削除。この identity の task を取り除く。
    Removed(TaskFilePath),
}

/// change 1 件を適用した結末。watcher の envelope 種別決定に使う。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AppliedTaskChange {
    Created(CanonicalTaskPath),
    Updated(CanonicalTaskPath),
    Removed(CanonicalTaskPath),
    /// `Removed` の対象が catalog に無かった（no-op）。
    AbsentOnRemove(CanonicalTaskPath),
}

impl AppliedTaskChange {
    pub(crate) fn identity(&self) -> &CanonicalTaskPath {
        match self {
            Self::Created(identity)
            | Self::Updated(identity)
            | Self::Removed(identity)
            | Self::AbsentOnRemove(identity) => identity,
        }
    }
}

/// `apply` / `apply_all` の決定的な結果。次状態の catalog を所有する。
#[derive(Debug)]
pub(crate) struct TaskChangeSet {
    next: TaskCatalog,
    /// 入力 change と同じ順。
    applied: Vec<AppliedTaskChange>,
    /// 変更前と内容が異なる task（追加・更新・派生値変化）。file_path 昇順。
    affected: Vec<Task>,
    /// 変更前にあって次状態に無い identity。昇順。
    removed: Vec<CanonicalTaskPath>,
}

impl TaskChangeSet {
    /// change ごとの結末（入力順）。
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "IPC patch（#400）が change 列から差分 payload を組み立てる際に読む"
        )
    )]
    pub(crate) fn applied(&self) -> &[AppliedTaskChange] {
        &self.applied
    }

    /// 変更前と内容が異なる task（file_path 昇順）。
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "IPC patch（#400）が affected task を payload に載せる際に読む"
        )
    )]
    pub(crate) fn affected(&self) -> &[Task] {
        &self.affected
    }

    /// 変更前にあって次状態に無い identity（昇順）。
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "IPC patch（#400）が removed identity を payload に載せる際に読む"
        )
    )]
    pub(crate) fn removed(&self) -> &[CanonicalTaskPath] {
        &self.removed
    }

    /// 次状態の catalog を借用で覗く。所有権ごと取り出すなら `into_catalog`。
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "テストの不変条件検証で使う。本番は `into_catalog` で commit する"
        )
    )]
    pub(crate) fn next(&self) -> &TaskCatalog {
        &self.next
    }

    /// 次状態でのその identity の task。削除済みなら `None`。
    pub(crate) fn task(&self, identity: &CanonicalTaskPath) -> Option<&Task> {
        self.next.get(identity)
    }

    /// その identity に対する最後の結末。
    pub(crate) fn outcome_of(&self, identity: &CanonicalTaskPath) -> Option<&AppliedTaskChange> {
        self.applied
            .iter()
            .rev()
            .find(|applied| applied.identity() == identity)
    }

    /// `targets` 以外の task が affected / removed に含まれるか。
    ///
    /// true のとき呼び出し側は単体 envelope ではなく resync を要求する。
    pub(crate) fn touches_other_than(&self, targets: &[CanonicalTaskPath]) -> bool {
        let is_other = |identity: &CanonicalTaskPath| !targets.contains(identity);
        self.affected
            .iter()
            .any(|task| is_other(&CanonicalTaskPath::from_file_path(task.file_path())))
            || self.removed.iter().any(is_other)
    }

    pub(crate) fn into_catalog(self) -> TaskCatalog {
        self.next
    }
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

    /// change 1 件を適用した次状態を計算する。`self` は変更しない。
    ///
    /// # Errors
    /// 親チェーンが深すぎるときだけ `TaskParseError`。
    pub(crate) fn apply(&self, change: TaskChange) -> Result<TaskChangeSet, TaskParseError> {
        self.apply_all(vec![change])
    }

    /// 複数 change を入力順に適用し、派生値を 1 回だけ作り直す。
    ///
    /// 同一 identity への複数 upsert は後勝ち、`Removed` 後の `Upserted` は再作成になる。
    /// 作業台を `BTreeMap` にするのは、resolver へ渡す candidate 順を identity 順で
    /// 決定的にするため（`HashMap` だと iteration 順が揺れる）。
    ///
    /// # Errors
    /// 親チェーンが深すぎるときだけ `TaskParseError`。
    pub(crate) fn apply_all(
        &self,
        changes: Vec<TaskChange>,
    ) -> Result<TaskChangeSet, TaskParseError> {
        let mut working: BTreeMap<CanonicalTaskPath, ParsedTask> = self
            .tasks
            .iter()
            .map(|task| {
                (
                    CanonicalTaskPath::from_file_path(task.file_path()),
                    task.to_parsed_task(),
                )
            })
            .collect();
        let mut applied = Vec::with_capacity(changes.len());
        for change in changes {
            applied.push(match change {
                TaskChange::Upserted(candidate) => {
                    let identity = CanonicalTaskPath::from_file_path(&candidate.file_path);
                    match working.insert(identity.clone(), *candidate) {
                        Some(_) => AppliedTaskChange::Updated(identity),
                        None => AppliedTaskChange::Created(identity),
                    }
                }
                TaskChange::Removed(path) => {
                    let identity = CanonicalTaskPath::from_file_path(&path);
                    match working.remove(&identity) {
                        Some(_) => AppliedTaskChange::Removed(identity),
                        None => AppliedTaskChange::AbsentOnRemove(identity),
                    }
                }
            });
        }
        let next = Self::from_unique_candidates(working.into_values().collect())?;
        let affected = next
            .tasks
            .iter()
            .filter(|task| {
                self.get(&CanonicalTaskPath::from_file_path(task.file_path())) != Some(task)
            })
            .cloned()
            .collect();
        let mut removed: Vec<CanonicalTaskPath> = self
            .index
            .keys()
            .filter(|identity| !next.contains(identity))
            .cloned()
            .collect();
        removed.sort();
        Ok(TaskChangeSet {
            next,
            applied,
            affected,
            removed,
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
