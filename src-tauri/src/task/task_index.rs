//! Task aggregate ドメイン。
//!
//! `Task` entity と `TaskIndex` aggregate root を同居させる。`TaskIndex` の
//! 不変条件（parent 存在 / 親チェーンに循環なし / 親チェーン深さ ≤ MAX）と
//! それを検証するロジックは、DDD 戦術的パターンに従い aggregate root の責務
//! としてこのファイルに集約する（独立した「validation」ファイルは作らない）。

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::column_name::ColumnName;
use crate::task::add_link::error::AddLinkError;
use crate::task::children::build_children;
use crate::task::create::error::CreateTaskError;
use crate::task::delete::error::DeleteTaskError;
use crate::task::due::Due;
use crate::task::frontmatter::{self, Parsed, Priority};
use crate::task::label::Label;
use crate::task::parse::{task_from_parsed, TaskParseContext, TaskParseError};
use crate::task::path_lookup::{
    append_child_to_parent, clear_children, normalize_link_path_for_lookup,
    normalize_parent_path_for_lookup, normalize_relative_path_for_input,
    normalize_task_path_for_lookup, parent_lookup_index, task_lookup_index, task_path_index,
};
use crate::task::remove_link::error::RemoveLinkError;
use crate::task::reverse_links::build_reverse_links;
use crate::task::task_content::TaskContent;
use crate::task::task_file_name::{TaskFileName, TaskFileNameError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_title::TaskTitle;
use crate::task::update::error::UpdateTaskError;
use crate::task::warning::{
    ensure_parent_cycle_warning, has_parent_cycle_warning, TaskWarning, TaskWarningCode,
};

/// 親チェーンを辿る際に許容する最大深さ。
///
/// 値 20 は実運用で現れる正当なタスク階層（要件 → 機能 → サブタスク程度）を
/// 十分に上回る一方、設定ミスや循環参照を実用上の上限として早期に打ち切る
/// ための保険として置いている。厳密な仕様上の限界ではなく、無限ループや
/// 異常に深いネストの検証コストを抑えるための値。引き上げると 1 タスクあたり
/// の親チェーン検証で辿るノード数が増えるため、深い階層を許容したい場合は
/// 検証コストへの影響を確認してから変更すること。
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
    /// マイルストーン参照キー（単数の自由文字列）。未割当時は `None`。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub milestone: Option<String>,
    pub labels: Vec<Label>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<TaskFilePath>,
    /// 期限（`YYYY-MM-DD`）を表す `Due` VO。検証は parse 時に行い、不正でも原文を保持する。
    /// 表示用の typed フィールド（透過シリアライズで文字列）だが、round-trip 保持は extras 側が担う。
    #[serde(skip_serializing_if = "Option::is_none")]
    pub due: Option<Due>,
    /// 下書きフラグ。false のときは payload にキーを出力しない（旧 FE との互換維持）。
    #[serde(skip_serializing_if = "is_false", default)]
    pub draft: bool,
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

/// `skip_serializing_if` は `fn(&bool) -> bool` を要求するため専用 helper を置く
/// （`std::ops::Not::not` は値渡しのため直接指定できない）。
fn is_false(v: &bool) -> bool {
    !*v
}

impl Task {
    /// scan で cycle member と判定された task の正規化状態（parent=None +
    /// parentCycle warning）を、disk 由来の生の値で再構築したこの task に引き継ぐ。
    ///
    /// effect 層（update / add_link / remove_link / watcher_event）が cache を
    /// 差分更新する際、非 parent 変更や link 操作で循環判定が崩れないよう、直前の
    /// cache 値が cycle member だったかどうか（`was_cycle_member`）を踏まえて
    /// parent と warning を上書きする。判定→preserve の規則を 1 箇所に集約し、
    /// 経路ごとの挙動差分を防ぐ。
    ///
    /// `drop_when_parent_absent` が true のとき、この task の parent が None なら
    /// 外部編集で親参照が消えて循環が解消されたとみなし、引き継がない。watcher
    /// 経由の disk 反映だけがこの解消判定を行い、新規循環の検出はフル再 scan に
    /// 委ねる。それ以外の経路は disk と一致した parent を握り潰してでも cycle
    /// 状態を維持する（false を渡す）。
    pub fn preserve_parent_cycle_state(
        &mut self,
        was_cycle_member: bool,
        drop_when_parent_absent: bool,
    ) {
        if !was_cycle_member {
            return;
        }
        if drop_when_parent_absent && self.parent.is_none() {
            return;
        }
        self.parent = None;
        ensure_parent_cycle_warning(&mut self.warnings);
    }
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

    /// 各ラベル名を「何件のタスクで使われているか」を数えて返す。
    ///
    /// 1 タスク内で同じラベルが重複していても 1 件（タスク単位で重複排除）。完全一致・
    /// 未正規化（trim / case 変換なし）。キーは所有 `String` で返し、呼び出し側
    /// （`get_labels` / `delete_label`）が借用ライフタイムに縛られないようにする。
    /// 使用数集計は label/config ドメインではなく task 集約に置くことで、依存方向を
    /// label/config → task の一方向に保つ（task は label を知らない）。aggregate が
    /// 保持する task 集合を集計対象とするため `&self` メソッドとして公開する。
    pub fn label_usage_counts(&self) -> HashMap<String, usize> {
        self.tasks
            .iter()
            // 各タスクを「そのタスクが持つ distinct なラベル集合」へ変換（タスク内重複排除）。
            .flat_map(|task| {
                task.labels
                    .iter()
                    .map(|label| label.as_str())
                    .collect::<HashSet<&str>>()
            })
            // distinct ラベルを 1 件ずつ畳み込んで件数マップへ集約する。
            .fold(HashMap::new(), |mut counts, label| {
                *counts.entry(label.to_owned()).or_insert(0) += 1;
                counts
            })
    }

    /// マイルストーン名ごとの使用タスク件数を集計する。
    ///
    /// labels（複数）と異なり milestone は単数 string のため、`Option` を 0/1 件に
    /// 展開して畳み込む（タスク内重複は構造的に発生しない）。マスタ未定義の値も
    /// 出現名で計上する（完全一致・未正規化）。未割当（`None`）は計上しない。aggregate が
    /// 保持する task 集合を集計対象とするため `&self` メソッドとして公開する。
    pub fn milestone_usage_counts(&self) -> HashMap<String, usize> {
        self.tasks
            .iter()
            .filter_map(|task| task.milestone.as_deref())
            .fold(HashMap::new(), |mut counts, name| {
                *counts.entry(name.to_owned()).or_insert(0) += 1;
                counts
            })
    }

    /// aggregate が保持する `Task` を `id` 昇順に並べた `Vec<Task>` を返す。
    ///
    /// `get_tasks` 等の読み取り API が依存する「id 昇順」契約をこの aggregate に
    /// 集約することで、application 層から並び順の知識を排除する。`Vec::sort_by`
    /// は安定ソートのため、同一 `id` の `Task` が混入した場合は入力順を保持する。
    /// aggregate を再利用しない読み取り用途のため `self` を消費する。
    pub fn sorted_by_id(self) -> Vec<Task> {
        let mut tasks = self.into_tasks();
        tasks.sort_by(|a, b| a.id.cmp(&b.id));
        tasks
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

    /// scan 経路用。親チェーンに循環が含まれる場合は Err を返さず、ループ内の
    /// 全 task に `parentCycle` warning を付けて `parent = None` に置き換える
    /// ことで scan 全体を継続させる。親チェーンの深さが `MAX_PARENT_DEPTH` を
    /// 超える (TooDeep) 場合のみ既存どおり `Err` を返す。
    ///
    /// 既存 `build_children` と同様、最初に `validate_parent_existence` を
    /// 実行して `ParentNotFound` warning を従来通り付与する。children 構築は
    /// 循環ノードを `parent = None` 化した後に行うため、cycle member は
    /// children 逆引きから自然に除外される。
    pub fn build_children_with_warnings(mut self) -> Result<Self, TaskParseError> {
        self.tasks = validate_parent_existence(self.tasks);

        let parent_lookup = parent_lookup_index(&self.tasks);

        // 各起点ごとに walk するための (normalized_path, origin_path) ペアを
        // 事前に収集する。origin は TooDeep 時の `file_path` に使う。
        let starts: Vec<(String, String)> = self
            .tasks
            .iter()
            .map(|task| {
                (
                    normalize_task_path_for_lookup(task.file_path.as_str()),
                    task.file_path.as_str().to_string(),
                )
            })
            .collect();

        let mut cycle_members: HashSet<String> = HashSet::new();
        for (start_norm, start_origin) in starts {
            match walk_parent_chain_collecting_cycle(&start_norm, &start_origin, &parent_lookup) {
                ParentChainOutcome::Ok => {}
                ParentChainOutcome::Cycle { members } => {
                    for member in members {
                        cycle_members.insert(member);
                    }
                }
                ParentChainOutcome::TooDeep { file_path } => {
                    return Err(TaskParseError::CycleOrTooDeep {
                        reason: ParentHierarchyErrorReason::TooDeep,
                        file_path,
                    });
                }
            }
        }

        self.mark_cycle_members(&cycle_members);
        Ok(self.build_children_links_only())
    }

    fn mark_cycle_members(&mut self, normalized_paths: &HashSet<String>) {
        for task in &mut self.tasks {
            let task_norm = normalize_task_path_for_lookup(task.file_path.as_str());
            if !normalized_paths.contains(&task_norm) {
                continue;
            }
            ensure_parent_cycle_warning(&mut task.warnings);
            task.parent = None;
        }
    }

    /// children を逆引きで構築するが、parent chain の hierarchy 検証は行わない。
    /// `build_children_with_warnings` が cycle member を `parent = None` 化した
    /// 後に呼び、cycle が children 逆引きで再構築されないことを呼び出し側で保証する。
    fn build_children_links_only(self) -> Self {
        let mut tasks = self.tasks;
        clear_children(&mut tasks);
        let parent_index = task_lookup_index(&tasks);
        for child_index in 0..tasks.len() {
            append_child_to_parent(child_index, &mut tasks, &parent_index);
        }
        Self { tasks }
    }

    /// 各 Task の `links` を逆引きして `reverse_links` を構築する。
    pub fn build_reverse_links(self) -> Self {
        Self {
            tasks: build_reverse_links(self.tasks),
        }
    }

    /// `replaced` で同一 path の slot を差し替え（無ければ末尾に追加）たうえで、
    /// parent hierarchy 検証 → `children` 再構築 → `reverse_links` 再構築までを
    /// 一括で行う aggregate メソッド。
    ///
    /// parent 変更を伴う `update_task` の cache full-rebuild 手順を aggregate に
    /// 集約することが目的。slot 差し替えの引き当ては `find_by_path` と同じ
    /// `normalize_task_path_for_lookup` 基準で行い、表記揺れがあっても同一 task を
    /// 差し替える（raw string 比較で重複 slot を作らない）。
    pub(crate) fn rebuild_with_replaced(self, replaced: Task) -> Result<Self, TaskParseError> {
        let mut values = self.tasks;
        let target = normalize_task_path_for_lookup(replaced.file_path.as_str());
        match values
            .iter_mut()
            .find(|t| normalize_task_path_for_lookup(t.file_path.as_str()) == target)
        {
            Some(slot) => *slot = replaced,
            None => values.push(replaced),
        }
        Self::new(values)
            .validate_parent_hierarchy()?
            .build_children()
            .map(Self::build_reverse_links)
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

    /// `add_link` の cache commit を行う差分更新 aggregate メソッド。
    ///
    /// snapshot 取得から本メソッド呼出までの間に他コマンドが cache を変更すると、
    /// ディスクは更新済みなのに source / target のいずれかが cache から消えている
    /// ケースが起こり得る。source / target 両方の存在を **先に確認** してから
    /// mutate に入り、`TargetVanished` 時に source だけ書き換わる部分更新を防ぐ。
    ///
    /// 派生フィールド（children / reverse_links / warnings）の保持マージ、cycle
    /// member の `parent=None` 維持判定、target の `reverse_links` への append は
    /// aggregate の不変条件であり、この内部に閉じ込める。
    ///
    /// 振る舞い:
    ///
    /// 1. source が cache に無ければ `SourceVanished`、target が無ければ
    ///    `TargetVanished` を返す（どちらも mutate 前に確認）。
    /// 2. source エントリの派生フィールド（children / reverse_links / warnings）は
    ///    既存値を保持しつつ、parse 由来フィールドのみ `updated_task` で上書きする。
    ///    `task_from_parsed` は children / reverse_links を空で返し downstream の
    ///    派生 warning も再生成しないが、add_link は parent / title / status /
    ///    labels / extras を一切変更せず links のみ追加するため、warnings は既存値の
    ///    保持で正しい状態が維持される。
    /// 3. parent は通常 `updated_task` 側（disk と一致した値）を採用するが、既存
    ///    cache が ParentCycle warning を持つ場合に限り cache 側の `parent=None` を
    ///    維持する。scan で循環判定されたノードの cycle 状態を link 追加程度の操作で
    ///    崩さないため。ファイル本体が外部編集で変わった場合は watcher 再 scan で
    ///    再判定される。
    /// 4. target の `reverse_links` に source を append する（既に push 済みなら
    ///    冪等に skip）。
    pub(crate) fn commit_add_link_into_cache(
        cache: &mut HashMap<PathBuf, Task>,
        source_key: &Path,
        target_normalized: &str,
        updated_task: &Task,
    ) -> Result<Task, AddLinkError> {
        let key = source_key.to_path_buf();
        if !cache.contains_key(&key) {
            return Err(AddLinkError::SourceVanished {
                path: source_key.to_string_lossy().into_owned(),
            });
        }
        if find_task_by_normalized(cache, target_normalized).is_none() {
            return Err(AddLinkError::TargetVanished {
                path: target_normalized.to_string(),
            });
        }

        let returned_task = overwrite_preserving_derived(cache, &key, updated_task);

        // target の reverse_links に source を append。既に push 済みなら冪等に skip。
        let target_task =
            find_task_mut(cache, target_normalized).expect("target presence verified above");
        if !target_task
            .reverse_links
            .iter()
            .any(|p| p == &updated_task.file_path)
        {
            target_task
                .reverse_links
                .push(updated_task.file_path.clone());
        }

        Ok(returned_task)
    }

    /// `remove_link` の cache commit を行う差分更新 aggregate メソッド。
    ///
    /// snapshot 取得から本メソッド呼出までの間に他コマンドが cache を変更すると、
    /// source が cache から消えていることがある。先に source の存在確認をしてから
    /// mutate に入る。target は cache に存在しなくても fail にしない（dangling link
    /// 掃除を許容するため、`commit_add_link_into_cache` と異なる）。
    ///
    /// 振る舞い:
    ///
    /// 1. source が cache に無ければ `SourceVanished` を返す。
    /// 2. source エントリの派生フィールド（children / reverse_links / warnings）を
    ///    保持しつつ parse 由来フィールドのみ `updated_task` で上書きする。remove_link
    ///    は parent / title / status / labels / extras を変更せず links を縮めるだけの
    ///    ため、warnings は既存値の保持で正しい状態が維持される。cycle member の
    ///    `parent=None` 維持判定は add_link と同様。
    /// 3. target が cache に存在すれば、その `reverse_links` から source を除去する。
    ///    存在しない場合は orphan link 掃除のユースケースを許容して skip する。
    ///    self-link（source == target）のケースでは source 自身の reverse_links が
    ///    retain されるため、戻り値は target update 後に cache から再取得する。
    pub(crate) fn commit_remove_link_into_cache(
        cache: &mut HashMap<PathBuf, Task>,
        source_key: &Path,
        target_normalized: &str,
        updated_task: &Task,
    ) -> Result<Task, RemoveLinkError> {
        let key = source_key.to_path_buf();
        if !cache.contains_key(&key) {
            return Err(RemoveLinkError::SourceVanished {
                path: source_key.to_string_lossy().into_owned(),
            });
        }

        overwrite_preserving_derived(cache, &key, updated_task);

        // target の reverse_links から source を除去。cache に target が存在しない
        // 場合は orphan link 掃除のユースケースを許容するため fail にせず skip する。
        if let Some(target_task) = find_task_mut(cache, target_normalized) {
            target_task
                .reverse_links
                .retain(|p| p != &updated_task.file_path);
        }

        // self-link では上の retain が source 自身の reverse_links を縮めるため、
        // 戻り値は target update 後の最新値を cache から再取得する。
        let returned_task = cache
            .get(&key)
            .expect("source presence verified above")
            .clone();
        Ok(returned_task)
    }

    /// 新規 task 作成の **planning** を行う aggregate メソッド。
    ///
    /// AppState / TaskIo / `std::fs::*` には一切触れず、`CreateTaskIntent`
    /// （ドメイン VO で構成された create リクエスト）と `project_root` から
    /// 配置先パス / 衝突回避済みファイル名 / `TaskContent` / 仮想 task を計算し、
    /// `CreateTaskOutcome` として返す。effect 層はこの outcome を消費して
    /// I/O と cache commit を実行する。
    pub(crate) fn plan_create(
        &self,
        project_root: &Path,
        intent: &CreateTaskIntent,
    ) -> Result<CreateTaskOutcome, CreateTaskError> {
        let parent_str = intent.parent.as_ref().map(|p| p.as_str());
        let parent_index = self.validate_new_parent(parent_str)?;

        let snapshot_slice = self.as_slice();
        let target_dir = resolve_target_dir(parent_index, snapshot_slice);
        let existing = existing_filenames_in_dir(snapshot_slice, &target_dir);
        let filename = match intent.file_name.as_deref() {
            Some(name) => TaskFileName::from_explicit(name, &existing)
                .map_err(CreateTaskError::from_file_name_error)?,
            None => TaskFileName::from_title(&intent.title, &existing).map_err(|err| {
                match err {
                    TaskFileNameError::InvalidTitle => CreateTaskError::InvalidTitle,
                    // from_title 経路では Empty / ContainsSeparator / NotMarkdown は
                    // 構造的に発生しないが、防御的に InvalidTitle に正規化する。
                    _ => CreateTaskError::InvalidTitle,
                }
            })?,
        };
        let rel_path = join_rel_path(&target_dir, &filename);
        let abs_path = project_root.join(&rel_path);
        let target_dir_abs = project_root.join(&target_dir);

        let resolved_parent_path =
            parent_index.map(|i| snapshot_slice[i].file_path.as_str().to_string());
        let normalized_links = normalize_create_links(&intent.links);
        let content =
            TaskContent::from_intent(intent, resolved_parent_path.as_deref(), &normalized_links)?;

        let provisional = build_provisional_task(
            &rel_path,
            intent,
            resolved_parent_path.as_deref(),
            &normalized_links,
        );
        self.validate_with_new_task(&provisional, parent_str)?;

        Ok(CreateTaskOutcome {
            rel_path,
            abs_path,
            target_dir_abs,
            content,
            status: intent.status.clone(),
        })
    }

    /// ファイル名プレビューを計算する aggregate メソッド。
    /// `plan_create` と同じ helper 群を使うが、副作用に依存しない読み取り専用計算。
    pub(crate) fn plan_preview_filename(
        &self,
        _project_root: &Path,
        args: &crate::task::preview_filename::PreviewTaskFilenameArgs,
    ) -> PreviewFilenameOutcome {
        let parent_index = match &args.parent_file_path {
            Some(p) if !p.is_empty() => match self.resolve_parent_for_new_task(p) {
                Some(i) => Some(i),
                None => {
                    return PreviewFilenameOutcome::Pending;
                }
            },
            _ => None,
        };

        let snapshot = self.as_slice();
        let target_dir = resolve_target_dir(parent_index, snapshot);
        let existing = existing_filenames_in_dir(snapshot, &target_dir);

        let filename = match &args.explicit_filename {
            Some(name) if !name.trim().is_empty() => {
                match TaskFileName::from_explicit(name, &existing) {
                    Ok(f) => f,
                    Err(e) => {
                        return PreviewFilenameOutcome::Invalid {
                            reason: e.to_string(),
                        };
                    }
                }
            }
            _ => {
                let title = TaskTitle::from_lenient(args.title.clone());
                match TaskFileName::from_title(&title, &existing) {
                    Ok(f) => f,
                    Err(_) => {
                        return PreviewFilenameOutcome::Invalid {
                            reason: "title cannot be converted to filename".to_string(),
                        };
                    }
                }
            }
        };

        let rel_path = join_rel_path(&target_dir, &filename);

        PreviewFilenameOutcome::Resolved {
            file_name: filename,
            rel_path,
        }
    }

    /// 既存 Task と raw `Parsed`（frontmatter + body）から、書き込むべき file_content
    /// と更新後 Task を計算する純粋関数。I/O / 時計 / 乱数に依存しない。
    ///
    /// 呼び出し側（effect 層）は事前に以下を済ませてから本関数を呼ぶ:
    ///
    /// - `io.read` で existing bytes 取得
    /// - `frontmatter::parse_bytes` で `Parsed` を取得（`None` ならエラーに変換）
    /// - cache から既存 Task を取得
    ///
    /// 検証順序:
    ///
    /// 1. parent 存在チェック（cache key 探索）→ なければ `ParentNotFound`
    /// 2. parent 置換後の `Vec<Task>` に対して `validate_parent_hierarchy`
    /// 3. patch 適用 + `frontmatter::serialize` で `String` を構築
    /// 4. `TaskContent::try_new(String)` で eligibility 検証
    /// 5. `task_from_parsed` を呼び直して updated_task を再構築し warning を再生成
    pub(crate) fn plan_update(
        &self,
        _project_root: &Path,
        intent: UpdateTaskIntent,
        existing: &Task,
        existing_parsed: Parsed,
    ) -> Result<UpdateTaskOutcome, UpdateTaskError> {
        let Parsed {
            mut frontmatter,
            mut body,
        } = existing_parsed;

        if let Some(title) = &intent.title {
            frontmatter.extras.insert(
                serde_yaml_ng::Value::String("title".into()),
                serde_yaml_ng::Value::String(title.clone()),
            );
        }
        if let Some(status) = &intent.status {
            frontmatter.extras.insert(
                serde_yaml_ng::Value::String("status".into()),
                serde_yaml_ng::Value::String(status.clone()),
            );
        }
        if let Some(priority) = intent.priority {
            frontmatter.priority = Some(priority);
        }
        // milestone は 3 値セマンティクス: None = 不変 / Some("") = クリア / Some(name) = 設定。
        if let Some(milestone) = &intent.milestone {
            if milestone.is_empty() {
                frontmatter.milestone = None;
            } else {
                frontmatter.milestone = Some(milestone.clone());
            }
        }
        // draft は 3 値セマンティクス: None = 不変 / Some(true) = 設定 / Some(false) = 解除。
        // 解除時は frontmatter から draft キー自体を除去する（draft: false は書かない）。
        if let Some(draft) = intent.draft {
            if draft {
                frontmatter.draft = Some(true);
            } else {
                frontmatter.draft = None;
            }
        }
        if let Some(labels) = &intent.labels {
            frontmatter.labels = labels.clone();
        }
        let parent_changed = match &intent.parent {
            None => false,
            Some(s) if s.is_empty() => {
                let removed = frontmatter
                    .extras
                    .remove(serde_yaml_ng::Value::String("parent".into()))
                    .is_some();
                removed || existing.parent.is_some()
            }
            Some(s) => {
                frontmatter.extras.insert(
                    serde_yaml_ng::Value::String("parent".into()),
                    serde_yaml_ng::Value::String(s.clone()),
                );
                // 正規化済み lookup key で比較する。raw string equality だと
                // `./tasks/p.md` / `tasks\p.md` 等の表記揺れで同一 task を指していても
                // changed と誤判定し、不要な full rebuild と非正規形での書き戻しを招く。
                let new_normalized = normalize_parent_path_for_lookup(s);
                let existing_normalized = existing
                    .parent
                    .as_ref()
                    .and_then(|p| normalize_parent_path_for_lookup(p.as_str()));
                new_normalized != existing_normalized
            }
        };
        if let Some(b) = &intent.body {
            // create_task と同じ正規化: 空文字は空 body / 既に `\n` で始まる入力は
            // そのまま採用 / それ以外は `---` 直後の慣例的な空行として `\n` を 1 個だけ前置。
            body = if b.is_empty() {
                String::new()
            } else if b.starts_with('\n') {
                b.clone()
            } else {
                format!("\n{b}")
            };
        }

        if let Some(parent_str) = intent.parent.as_deref().filter(|s| !s.is_empty()) {
            if resolve_parent_for_new_task(parent_str, self.as_slice()).is_none() {
                return Err(UpdateTaskError::ParentNotFound {
                    path: parent_str.to_string(),
                });
            }
        }

        if parent_changed {
            let preliminary_task = build_patched_task(existing, &intent);
            let mut values: Vec<Task> = self.as_slice().to_vec();
            let target_key = intent.file_path.to_string_lossy();
            if let Some(slot) = values
                .iter_mut()
                .find(|t| t.file_path.as_str() == target_key.as_ref())
            {
                *slot = preliminary_task;
            } else {
                values.push(preliminary_task);
            }
            TaskIndex::new(values)
                .validate_parent_hierarchy()
                .map_err(UpdateTaskError::from)?;
        }

        let serialized = frontmatter::serialize(&Parsed {
            frontmatter: frontmatter.clone(),
            body: body.clone(),
        });

        TaskContent::try_new(serialized.clone()).map_err(UpdateTaskError::from)?;

        let context = TaskParseContext {
            file_path: existing.file_path.as_path_buf(),
            default_status: existing.status.clone(),
        };
        let updated_task = task_from_parsed(Parsed { frontmatter, body }, &context);

        Ok(UpdateTaskOutcome {
            updated_task,
            file_content: serialized,
            needs_full_rebuild: parent_changed,
        })
    }

    /// 既存 source `Task` に対して target を `links` に追加した結果を計算する pure
    /// aggregate method。
    ///
    /// 呼び出し前提:
    ///
    /// - `source_existing` は effect 層が cache snapshot から `intent.source` で
    ///   引き当て済みの `&Task`（snapshot に無ければ effect 層が早期 `SourceNotFound`）。
    /// - `source_parsed` は effect 層が `io.read` + `frontmatter::parse_bytes` 済み。
    ///
    /// 振る舞い:
    ///
    /// 1. source / target を lookup 用に正規化する。
    /// 2. 同一 path への self-link は `SelfLink` で reject。
    /// 3. target が aggregate に存在しなければ `TargetNotFound`。
    /// 4. `source.links` に target が既に含まれていれば `NoOp` を返す（表記揺れ吸収）。
    /// 5. それ以外は `links` 末尾に正規化済み相対 path を push し、`frontmatter::serialize`
    ///    で書き戻し用文字列を作る。`TaskContent::try_new` で scanner eligible 検証も行う。
    /// 6. `task_from_parsed` で `updated_task` を再構築して `Write` Outcome を返す。
    pub(crate) fn plan_add_link(
        &self,
        _project_root: &Path,
        intent: AddLinkIntent,
        source_existing: &Task,
        source_parsed: Parsed,
    ) -> Result<AddLinkOutcome, AddLinkError> {
        let source_str = intent.source.to_string_lossy();
        let source_norm = normalize_link_path_for_lookup(source_str.as_ref()).ok_or_else(|| {
            AddLinkError::SourceNotFound {
                path: source_str.clone().into_owned(),
            }
        })?;
        let target_str = intent.target.to_string_lossy();
        let target_norm = normalize_link_path_for_lookup(target_str.as_ref()).ok_or_else(|| {
            AddLinkError::TargetNotFound {
                path: target_str.clone().into_owned(),
            }
        })?;

        if source_norm == target_norm {
            return Err(AddLinkError::SelfLink { path: target_norm });
        }

        let target_in_index = self
            .tasks
            .iter()
            .any(|t| normalize_task_path_for_lookup(t.file_path.as_str()) == target_norm);
        if !target_in_index {
            return Err(AddLinkError::TargetNotFound { path: target_norm });
        }

        let existing_set: HashSet<String> = source_parsed
            .frontmatter
            .links
            .iter()
            .filter_map(|l| normalize_link_path_for_lookup(l))
            .collect();
        if existing_set.contains(&target_norm) {
            return Ok(AddLinkOutcome::NoOp {
                existing_task: source_existing.clone(),
            });
        }

        let push_str = normalize_relative_path_for_input(target_str.as_ref()).ok_or_else(|| {
            AddLinkError::TargetNotFound {
                path: target_str.clone().into_owned(),
            }
        })?;

        let Parsed {
            mut frontmatter,
            body,
        } = source_parsed;
        frontmatter.links.push(push_str);

        let file_content = frontmatter::serialize(&Parsed {
            frontmatter: frontmatter.clone(),
            body: body.clone(),
        });
        TaskContent::try_new(file_content.clone()).map_err(AddLinkError::from)?;

        let context = TaskParseContext {
            file_path: source_existing.file_path.as_path_buf(),
            default_status: source_existing.status.clone(),
        };
        let updated_task = task_from_parsed(Parsed { frontmatter, body }, &context);

        Ok(AddLinkOutcome::Write {
            updated_task,
            file_content,
            target_normalized: target_norm,
        })
    }

    /// 既存 source `Task` から target を `links` 上で除去した結果を計算する pure
    /// aggregate method。
    ///
    /// 呼び出し前提:
    ///
    /// - `source_existing` は effect 層が cache snapshot から `intent.source` で
    ///   引き当て済みの `&Task`。
    /// - `source_parsed` は effect 層が `io.read` + `frontmatter::parse_bytes` 済み。
    ///
    /// 振る舞い:
    ///
    /// 1. source / target を lookup 用に正規化する。失敗時は `SourceNotFound` /
    ///    `InvalidTargetPath` を返す（args 段階で reject 済みなので通常到達不可）。
    /// 2. `source_parsed.frontmatter.links` を走査し、normalize 結果が target_norm と
    ///    完全一致する要素を **すべて** 除去する。表記揺れで重複登録されている場合は
    ///    一括で掃除される。
    /// 3. 1 件も除去されなければ `NoOp { existing_task }` を返す（冪等成功）。
    /// 4. 除去ありなら `frontmatter::serialize` で書き戻し用 string を生成し、
    ///    `TaskContent::try_new` で scanner eligible 検証、`task_from_parsed` で
    ///    `updated_task` を再構築して `Write` Outcome を返す。
    ///
    /// add_link との差分: target が aggregate に存在するかは検証しない（dangling
    /// link 掃除のユースケースを許容する）。self-link チェックも不要（src/tgt が
    /// 同一の場合、もとから links に含まれていれば NoOp ではなく Write になり
    /// 1 件除去されるだけ）。parent / children 不変条件は links 削除では影響しないため
    /// 検証しない。
    pub(crate) fn plan_remove_link(
        &self,
        _project_root: &Path,
        intent: RemoveLinkIntent,
        source_existing: &Task,
        source_parsed: Parsed,
    ) -> Result<RemoveLinkOutcome, RemoveLinkError> {
        let source_str = intent.source.to_string_lossy();
        let _source_norm =
            normalize_link_path_for_lookup(source_str.as_ref()).ok_or_else(|| {
                RemoveLinkError::SourceNotFound {
                    path: source_str.clone().into_owned(),
                }
            })?;
        let target_str = intent.target.to_string_lossy();
        let target_norm = normalize_link_path_for_lookup(target_str.as_ref()).ok_or_else(|| {
            RemoveLinkError::InvalidTargetPath {
                path: target_str.clone().into_owned(),
            }
        })?;

        let Parsed {
            mut frontmatter,
            body,
        } = source_parsed;

        let original_len = frontmatter.links.len();
        frontmatter
            .links
            .retain(|l| normalize_link_path_for_lookup(l).as_deref() != Some(target_norm.as_str()));
        if frontmatter.links.len() == original_len {
            return Ok(RemoveLinkOutcome::NoOp {
                existing_task: source_existing.clone(),
            });
        }

        let file_content = frontmatter::serialize(&Parsed {
            frontmatter: frontmatter.clone(),
            body: body.clone(),
        });
        TaskContent::try_new(file_content.clone()).map_err(RemoveLinkError::from)?;

        let context = TaskParseContext {
            file_path: source_existing.file_path.as_path_buf(),
            default_status: source_existing.status.clone(),
        };
        let updated_task = task_from_parsed(Parsed { frontmatter, body }, &context);

        Ok(RemoveLinkOutcome::Write {
            updated_task,
            file_content,
            target_normalized: target_norm,
        })
    }

    /// 削除対象 path を parent に持つ直接の子 task の **プロジェクトルート相対** path を
    /// snapshot 順で列挙する pure aggregate query。
    ///
    /// 表記揺れ（`./tasks/x.md` / `tasks\x.md` 等）は `normalize_parent_path_for_lookup`
    /// で吸収する。raw string 比較は意図的に避ける（plan_update の parent 比較と同じ理由）。
    ///
    /// 孫 task は含めない（直接の子のみ）。`deleted_path` が誰の親でもない場合は空 Vec。
    pub(crate) fn children_paths_of(&self, deleted_path: &str) -> Vec<PathBuf> {
        let Some(deleted_norm) = normalize_parent_path_for_lookup(deleted_path) else {
            return Vec::new();
        };
        self.tasks
            .iter()
            // 自己除外は raw 文字列ではなく lookup-normalized 同士で比較する。
            // 表記揺れ（`./tasks/p.md` vs `tasks/p.md` 等）で自分自身を
            // 子としてすり抜けさせないため。
            .filter(|t| normalize_task_path_for_lookup(t.file_path.as_str()) != deleted_norm)
            .filter_map(|t| {
                let parent = t.parent.as_ref()?;
                let parent_norm = normalize_parent_path_for_lookup(parent.as_str())?;
                (parent_norm == deleted_norm).then(|| PathBuf::from(t.file_path.as_str()))
            })
            .collect()
    }

    /// 削除対象 task に直接の子 task が存在するかを検証する pure aggregate method。
    ///
    /// 子が 1 件でもあれば `DeleteTaskError::HasChildren` を返し、削除を中断させる。
    /// 子の検出は `children_paths_of` に委譲するため、表記揺れ吸収・自己除外・
    /// 直接の子のみ列挙といった契約はそちらに従う。
    ///
    /// `deleted_path` は呼び出し側（effect 層）で正規化済みのプロジェクトルート
    /// 相対パスを渡す前提（不正パスのエラー化は effect 層の責務）。
    pub(crate) fn plan_delete_abort(&self, deleted_path: &str) -> Result<(), DeleteTaskError> {
        let children = self.children_paths_of(deleted_path);
        if children.is_empty() {
            return Ok(());
        }
        Err(DeleteTaskError::HasChildren {
            path: deleted_path.to_string(),
            children,
        })
    }

    /// 削除対象 task の全子 task について、parent キーを除去した new file_content と
    /// 更新後 Task を計算する pure aggregate method。I/O / 時計 / 乱数に依存しない。
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "delete_task IPC (Issue #90) で本 method を呼び出す予定。caller 追加時に expect を外す。"
        )
    )]
    pub(crate) fn plan_clear_children_of(
        &self,
        _deleted_path: &str,
        loaded: Vec<ClearChildrenInput>,
    ) -> Result<ClearChildrenOutcome, ClearChildrenError> {
        let mut entries = Vec::with_capacity(loaded.len());

        for ClearChildrenInput { path, parsed } in loaded {
            let Parsed {
                mut frontmatter,
                body,
            } = parsed;

            // parent キー除去（typed フィールドではなく extras 上に保持されているため
            // plan_update と同じ `extras.remove` API を使う）。
            frontmatter
                .extras
                .remove(serde_yaml_ng::Value::String("parent".into()));

            let serialized = frontmatter::serialize(&Parsed {
                frontmatter: frontmatter.clone(),
                body: body.clone(),
            });

            TaskContent::try_new(serialized.clone()).map_err(|err| {
                ClearChildrenError::ContentRejected {
                    path: path.clone(),
                    reason: err.to_string(),
                }
            })?;

            let default_status = self
                .find_by_path(&path)
                .map(|t| t.status.clone())
                .unwrap_or_else(|| ColumnName::from_lenient(""));
            let context = TaskParseContext {
                file_path: path.clone(),
                default_status,
            };
            let updated_task = task_from_parsed(Parsed { frontmatter, body }, &context);

            entries.push(ClearedChildEntry {
                path,
                updated_task,
                file_content: serialized,
            });
        }

        Ok(ClearChildrenOutcome { entries })
    }

    /// snapshot 上で `path` と一致する task を返す aggregate query（正規化済み比較）。
    ///
    /// 引き当ては `normalize_task_path_for_lookup` を介して行うため、`./tasks/x.md` /
    /// `tasks\x.md` のような表記揺れがあっても aggregate が一貫して使う lookup 基準で
    /// 同一 task を引き当てる。command 層が `Path::new(t.file_path.as_str()) == rel_path`
    /// の raw 比較を各自で行うのを避け、引き当て規則を aggregate に集約するために公開する。
    pub(crate) fn find_by_path(&self, path: &Path) -> Option<&Task> {
        let target = normalize_task_path_for_lookup(&path.to_string_lossy());
        self.tasks
            .iter()
            .find(|t| normalize_task_path_for_lookup(t.file_path.as_str()) == target)
    }
}

impl From<Vec<Task>> for TaskIndex {
    fn from(tasks: Vec<Task>) -> Self {
        Self::new(tasks)
    }
}

/// `create_task` ユースケースで `TaskIndex::plan_create` に渡す入力 DTO。
///
/// IPC 境界の `CreateTaskArgs`（serde camelCase の `String` 群）を VO に変換した
/// **ドメイン側の表現**。application 層で `From<CreateTaskArgs>` を実装することで
/// IPC 表現とドメイン表現の責務を分離する。
pub struct CreateTaskIntent {
    pub title: TaskTitle,
    pub status: ColumnName,
    pub priority: Option<Priority>,
    /// マイルストーン参照キー（単数の自由文字列）。未指定 / 空文字は `None`（未割当）。
    pub milestone: Option<String>,
    pub labels: Vec<Label>,
    pub parent: Option<TaskFilePath>,
    /// 関連タスクへの生の raw 相対 path。`plan_create` が
    /// `normalize_create_links` で dedup・パス正規化・lenient 保持を行う。
    pub links: Vec<String>,
    pub body: Option<String>,
    /// 明示指定するファイル名（`.md` 付き完全名）。`None` ならタイトル由来で自動生成。
    pub file_name: Option<String>,
    /// 期限（`YYYY-MM-DD`）。`None` / 空文字なら due キーを出力しない。
    pub due: Option<String>,
    /// 下書きとして作成するか。true のとき frontmatter に `draft: true` を出力する。
    pub draft: bool,
}

/// `update_task` IPC 境界から domain に渡される更新意図。
///
/// `Some` のフィールドだけが適用される。`parent: Some("")` は親解除。
/// `priority` は `None` = 不変。
#[derive(Debug, Clone)]
pub struct UpdateTaskIntent {
    /// 対象タスクのプロジェクトルート相対パス（正規化済み）。
    pub file_path: PathBuf,
    pub title: Option<String>,
    pub status: Option<String>,
    pub priority: Option<Priority>,
    /// マイルストーンの更新意図（既存 parent と同じ 3 値セマンティクス）:
    /// `None` = 不変 / `Some("")` = クリア / `Some(name)` = 設定。
    pub milestone: Option<String>,
    pub labels: Option<Vec<String>>,
    pub parent: Option<String>,
    pub body: Option<String>,
    /// draft の更新意図（3 値）: `None` = 不変 / `Some(true)` = draft 化 /
    /// `Some(false)` = 解除（frontmatter から draft キーを除去）。
    pub draft: Option<bool>,
}

/// `TaskIndex::plan_update` の計算結果。effect 層が消費する。
#[derive(Debug)]
pub struct UpdateTaskOutcome {
    pub updated_task: Task,
    pub file_content: String,
    /// parent が変化した場合のみ true。effect 層は TaskIndex を再構築する。
    pub needs_full_rebuild: bool,
}

/// `add_link` IPC 境界から domain に渡される追加意図。
///
/// `source` / `target` はいずれも project_root 相対の正規化済み path。
/// args 変換層で `into_intent` を通して構築される。
#[derive(Debug, Clone)]
pub struct AddLinkIntent {
    pub source: PathBuf,
    pub target: PathBuf,
}

/// `remove_link` IPC 境界から domain に渡される削除意図。
///
/// `AddLinkIntent` とは別型で持つ。意味的な混同を避けるためと、aggregate method
/// の引数型から `add_link` モジュールへの依存を切るため。
#[derive(Debug, Clone)]
pub struct RemoveLinkIntent {
    pub source: PathBuf,
    pub target: PathBuf,
}

/// `TaskIndex::plan_add_link` の計算結果。effect 層が消費する。
#[derive(Debug)]
pub(crate) enum AddLinkOutcome {
    Write {
        updated_task: Task,
        file_content: String,
        /// effect 層が cache 上の target エントリを引くための正規化済み相対 path
        /// （`normalize_link_path_for_lookup` の出力形）。
        target_normalized: String,
    },
    NoOp {
        /// IPC 戻り値に使う既存 source の現在状態（plan_add_link に渡された
        /// `source_existing` の clone）。
        existing_task: Task,
    },
}

/// `TaskIndex::plan_remove_link` の計算結果。effect 層が消費する。
///
/// `Write` は実際に `links` から target エントリを除去した場合。`NoOp` は
/// 元から含まれていない場合の冪等成功。
#[derive(Debug)]
pub(crate) enum RemoveLinkOutcome {
    Write {
        updated_task: Task,
        file_content: String,
        /// effect 層が cache 上の target エントリを引くための正規化済み相対 path
        /// （`normalize_link_path_for_lookup` の出力形）。
        target_normalized: String,
    },
    NoOp {
        /// IPC 戻り値に使う既存 source の現在状態（plan_remove_link に渡された
        /// `source_existing` の clone）。
        existing_task: Task,
    },
}

/// `TaskIndex::plan_create` の計算結果。effect 層が消費する。
#[derive(Debug)]
pub struct CreateTaskOutcome {
    pub rel_path: PathBuf,
    pub abs_path: PathBuf,
    pub target_dir_abs: PathBuf,
    pub content: TaskContent,
    /// effect 層が cache commit 時の `default_status` として使う。
    pub status: ColumnName,
}

/// `TaskIndex::plan_clear_children_of` への入力。
///
/// effect 層（`delete_task` IPC コマンド）が `io.read` + `frontmatter::parse_bytes`
/// で事前に取得した子 task 1 件分の (path, Parsed) ペア。
pub(crate) struct ClearChildrenInput {
    /// プロジェクトルート相対 path（`children_paths_of` の出力をそのまま使う想定）。
    pub path: PathBuf,
    /// `frontmatter::parse_bytes` で得た Parsed。
    /// frontmatter が無い md は effect 層側で別エラーに変換し、本関数には到達させない。
    pub parsed: Parsed,
}

/// `TaskIndex::plan_clear_children_of` の計算結果。effect 層が消費する。
#[derive(Debug)]
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "delete_task IPC (Issue #90) が本型を消費する予定。caller 追加時に expect を外す。"
    )
)]
pub(crate) struct ClearChildrenOutcome {
    pub entries: Vec<ClearedChildEntry>,
}

/// clear 対象 1 件分の計算結果。
#[derive(Debug)]
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "delete_task IPC (Issue #90) が本型を消費する予定。caller 追加時に expect を外す。"
    )
)]
pub(crate) struct ClearedChildEntry {
    /// 入力 `ClearChildrenInput::path` をそのまま保持。
    pub path: PathBuf,
    /// `task_from_parsed` で再構築済みの新 Task（effect 層が cache に書き戻す）。
    pub updated_task: Task,
    /// `frontmatter::serialize` 出力（effect 層が `io.write_existing` で書き戻す）。
    pub file_content: String,
}

/// `TaskIndex::plan_clear_children_of` のエラー。
///
/// pure 関数のため I/O 系 variant は持たない。それらは effect 層が独自エラー型に詰め直す。
#[derive(Debug, thiserror::Error)]
pub(crate) enum ClearChildrenError {
    #[error("content rejected for {}: {reason}", .path.display())]
    ContentRejected { path: PathBuf, reason: String },
}

/// `TaskIndex::plan_preview_filename` の計算結果。
/// command 層が `into_payload` で IPC 応答型に変換する。
#[derive(Debug)]
pub(crate) enum PreviewFilenameOutcome {
    Resolved {
        file_name: TaskFileName,
        rel_path: PathBuf,
    },
    Invalid {
        reason: String,
    },
    Pending,
}

impl PreviewFilenameOutcome {
    pub(crate) fn into_payload(
        self,
        project_root: &Path,
    ) -> crate::task::preview_filename::PreviewTaskFilenamePayload {
        use crate::task::preview_filename::PreviewTaskFilenamePayload;
        match self {
            Self::Resolved {
                file_name,
                rel_path,
            } => {
                let full_path = project_root.join(&rel_path);
                PreviewTaskFilenamePayload::Path {
                    file_name: file_name.into_string(),
                    rel_path: rel_path.to_string_lossy().into_owned(),
                    full_path: full_path.to_string_lossy().into_owned(),
                }
            }
            Self::Invalid { reason } => PreviewTaskFilenamePayload::Invalid { error: reason },
            Self::Pending => PreviewTaskFilenamePayload::Pending,
        }
    }
}

/// 親 task の dirname を返す。親未指定なら `tasks/`。
fn resolve_target_dir(parent_index: Option<usize>, snapshot: &[Task]) -> PathBuf {
    match parent_index {
        Some(i) => {
            let p = Path::new(snapshot[i].file_path.as_str());
            p.parent().map(Path::to_path_buf).unwrap_or_default()
        }
        None => PathBuf::from("tasks"),
    }
}

/// `target_dir` 直下に存在する Task のファイル名集合を作る。
fn existing_filenames_in_dir(tasks: &[Task], target_dir: &Path) -> HashSet<String> {
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

/// `target_dir.join(filename)` 相当だが、`target_dir` が空ならルート直下扱い。
fn join_rel_path(target_dir: &Path, filename: &TaskFileName) -> PathBuf {
    if target_dir.as_os_str().is_empty() {
        PathBuf::from(filename.as_str())
    } else {
        target_dir.join(filename.as_str())
    }
}

/// `plan_update` で parent 変更を検証する際の置換用 Task を作る。
///
/// 最終的に返却される Task は `task_from_parsed` 再走の結果に置き換わるため、
/// ここでは循環/深さ検証に必要なフィールド（特に `parent`）だけ正しく埋まっていればよい。
fn build_patched_task(existing: &Task, intent: &UpdateTaskIntent) -> Task {
    let mut task = existing.clone();
    if let Some(title) = &intent.title {
        task.title = TaskTitle::from_lenient(title.clone());
    }
    if let Some(priority) = intent.priority {
        task.priority = Some(priority);
    }
    if let Some(labels) = &intent.labels {
        task.labels = labels
            .iter()
            .map(|s| Label::from_lenient(s.clone()))
            .collect();
    }
    if let Some(parent) = &intent.parent {
        if parent.is_empty() {
            task.parent = None;
        } else {
            task.parent = Some(TaskFilePath::from_lenient(parent.clone()));
        }
    }
    if let Some(body) = &intent.body {
        task.body = format!("\n{body}");
    }
    if let Some(status) = &intent.status {
        task.status = ColumnName::from_lenient(status.clone());
    }
    task
}

/// 作成時 links の lenient 正規化。
///
/// 空・絶対・drive prefix のパスは除外し、正規化後に重複を除去する
/// （先勝ち = 最初の出現順を保持）。存在しないパスも parent 同一パスも reject せず
/// 保持する（self/parent 除外は FE ピッカー側の責務。dangling はフロント派生で警告表示する）。
fn normalize_create_links(raw_links: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    for raw in raw_links {
        let Some(candidate) = normalize_relative_path_for_input(raw) else {
            continue;
        };
        if normalized.contains(&candidate) {
            continue;
        }
        normalized.push(candidate);
    }
    normalized
}

/// augmented hierarchy 検証用に最低限のフィールドだけ埋めた Task を作る。
fn build_provisional_task(
    rel_path: &Path,
    intent: &CreateTaskIntent,
    resolved_parent_path: Option<&str>,
    normalized_links: &[String],
) -> Task {
    let file_path = TaskFilePath::from_lenient(rel_path.to_string_lossy().replace('\\', "/"));
    let parent = resolved_parent_path.map(TaskFilePath::from_lenient);
    let links = normalized_links
        .iter()
        .map(|link| TaskFilePath::from_lenient(link.clone()))
        .collect();
    Task {
        id: file_path.clone(),
        file_path,
        title: intent.title.clone(),
        status: intent.status.clone(),
        priority: None,
        milestone: None,
        draft: intent.draft,
        labels: Vec::new(),
        parent,
        due: None,
        links,
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: BTreeMap::new(),
        warnings: Vec::new(),
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

/// `build_children_with_warnings` での parent chain 走査結果。
///
/// `Cycle.members` は循環ループに含まれる task の正規化済み path 集合。
/// tail 部分（cycle に到達するまでの経路）は含まない。
enum ParentChainOutcome {
    Ok,
    Cycle { members: Vec<String> },
    TooDeep { file_path: String },
}

/// 起点 task から parent chain を walk し、循環または TooDeep を検出する。
///
/// traversal stack (`Vec<String>`) と position (`HashMap<String, usize>`) で
/// 経路上の正規化済み path を保持し、再出現した path の index 以降のみを cycle
/// member として返す。これにより tail 付き循環 (`D → A → B → A`) でも tail (`D`)
/// を巻き込まずに循環本体だけを抽出できる。
///
/// 深さ判定の順序は既存 `validate_parent_chain` と一致させる:
/// 1) current の cycle 判定（stack/position 挿入時）
/// 2) parent lookup
/// 3) parent が None なら Ok 終端
/// 4) `depth += 1`
/// 5) `depth > MAX_PARENT_DEPTH` なら TooDeep
/// 6) current = parent
fn walk_parent_chain_collecting_cycle(
    start_norm: &str,
    start_origin: &str,
    parent_lookup: &HashMap<String, Option<String>>,
) -> ParentChainOutcome {
    let mut stack: Vec<String> = Vec::new();
    let mut position: HashMap<String, usize> = HashMap::new();
    let mut current = start_norm.to_string();
    let mut depth: usize = 0;

    loop {
        if let Some(&idx) = position.get(&current) {
            let members = stack[idx..].to_vec();
            return ParentChainOutcome::Cycle { members };
        }
        position.insert(current.clone(), stack.len());
        stack.push(current.clone());

        let Some(Some(parent)) = parent_lookup.get(&current) else {
            return ParentChainOutcome::Ok;
        };

        depth += 1;
        if depth > MAX_PARENT_DEPTH {
            return ParentChainOutcome::TooDeep {
                file_path: start_origin.to_string(),
            };
        }

        current = parent.clone();
    }
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

/// link commit 共通の source エントリ上書きロジック。
///
/// cache 上の既存 source エントリから派生フィールド（children / reverse_links /
/// warnings）を退避し、parse 由来フィールドのみ `updated_task` で上書きする。
/// parent は通常 `updated_task` 側を採用するが、既存 cache が ParentCycle warning を
/// 持つ場合に限り cache 側の `parent=None`（cycle 状態）を維持する。cycle 状態の
/// 引き継ぎ判定・preserve は `Task::preserve_parent_cycle_state` に一元化されており、
/// ここではその呼び出しに委譲する。
///
/// 呼び出し側は `key` が cache に存在することを事前に検証している前提。上書き後の
/// source エントリの clone を返す。
fn overwrite_preserving_derived(
    cache: &mut HashMap<PathBuf, Task>,
    key: &PathBuf,
    updated_task: &Task,
) -> Task {
    let source_entry = cache
        .get_mut(key)
        .expect("source presence verified by caller");
    let was_cycle_member = has_parent_cycle_warning(&source_entry.warnings);
    let preserved_children = std::mem::take(&mut source_entry.children);
    let preserved_reverse = std::mem::take(&mut source_entry.reverse_links);
    let preserved_warnings = std::mem::take(&mut source_entry.warnings);
    *source_entry = Task {
        children: preserved_children,
        reverse_links: preserved_reverse,
        warnings: preserved_warnings,
        ..updated_task.clone()
    };
    source_entry.preserve_parent_cycle_state(was_cycle_member, false);
    source_entry.clone()
}

fn find_task_mut<'a>(
    cache: &'a mut HashMap<PathBuf, Task>,
    normalized: &str,
) -> Option<&'a mut Task> {
    cache.get_mut(&PathBuf::from(normalized))
}

/// cache から `normalized` 一致の `Task` を immutable で引き当てる helper。
///
/// `find_task_mut` の immutable 版。link commit で mutate 前の事前検証（target 存在
/// 確認）に使う。複数 `&mut` を同時に取れない `HashMap` の制約下で「検証 → mutate」の
/// 2 段構成を可能にする。
fn find_task_by_normalized<'a>(
    cache: &'a HashMap<PathBuf, Task>,
    normalized: &str,
) -> Option<&'a Task> {
    cache.get(&PathBuf::from(normalized))
}

#[cfg(test)]
#[path = "task_index_tests.rs"]
mod task_index_tests;

#[cfg(test)]
#[path = "task_index_parent_chain_tests.rs"]
mod task_index_parent_chain_tests;

#[cfg(test)]
#[path = "task_index_label_usage_tests.rs"]
mod task_index_label_usage_tests;

#[cfg(test)]
#[path = "task_index_milestone_usage_tests.rs"]
mod task_index_milestone_usage_tests;

#[cfg(test)]
#[path = "task_index_plan_create_tests.rs"]
mod task_index_plan_create_tests;

#[cfg(test)]
#[path = "task_index_plan_update_tests.rs"]
mod task_index_plan_update_tests;

#[cfg(test)]
#[path = "task_index_clear_children_tests.rs"]
mod task_index_clear_children_tests;

#[cfg(test)]
#[path = "task_index_plan_delete_abort_tests.rs"]
mod task_index_plan_delete_abort_tests;

#[cfg(test)]
#[path = "task_index_cycle_preservation_tests.rs"]
mod task_index_cycle_preservation_tests;

#[cfg(test)]
#[path = "task_index_plan_add_link_tests.rs"]
mod task_index_plan_add_link_tests;

#[cfg(test)]
#[path = "task_index_plan_remove_link_tests.rs"]
mod task_index_plan_remove_link_tests;

#[cfg(test)]
#[path = "task_index_plan_preview_filename_tests.rs"]
mod task_index_plan_preview_filename_tests;
