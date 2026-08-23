//! Task aggregate ドメイン。
//!
//! `Task` entity と `TaskIndex` aggregate root を同居させる。`TaskIndex` の
//! 不変条件（parent 存在 / 親チェーンに循環なし / 親チェーン深さ ≤ MAX）と
//! それを検証するロジックは、DDD 戦術的パターンに従い aggregate root の責務
//! としてこのファイルに集約する（独立した「validation」ファイルは作らない）。

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;
use std::path::{Path, PathBuf};

use crate::config::column_name::ColumnName;
use crate::config::{Column, Config};
use crate::task::add_link::error::AddLinkError;
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::children::build_children;
use crate::task::create::error::CreateTaskError;
use crate::task::delete::error::DeleteTaskError;
use crate::task::document::{Patch, TaskDocument, TaskPatch};
use crate::task::due::Due;
use crate::task::frontmatter::{Parsed, Priority};
use crate::task::label::Label;
use crate::task::move_task::error::MoveTaskError;
use crate::task::parse::{TaskParseContext, TaskParseError};
use crate::task::path_lookup::{
    append_child_to_parent, clear_children, normalize_link_path_for_lookup,
    normalize_parent_path_for_lookup, normalize_relative_path_for_input,
    normalize_task_path_for_lookup, parent_lookup_index, task_lookup_index, task_path_index,
};
use crate::task::projection::{
    MilestoneProjectionMap, SubIssueProgress, TaskForest, TaskProjection, TaskProjectionMap,
    TaskTreeNode,
};
use crate::task::remove_link::error::RemoveLinkError;
use crate::task::reverse_links::build_reverse_links;
use crate::task::task_content::TaskContent;
use crate::task::task_file_name::{TaskFileName, TaskFileNameError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_title::TaskTitle;
use crate::task::update::error::UpdateTaskError;
use crate::task::warning::{ensure_parent_cycle_warning, TaskWarning, TaskWarningCode};

/// 親チェーンを辿る際に許容する最大深さ。
///
/// 値 20 は実運用で現れる正当なタスク階層（要件 → 機能 → サブタスク程度）を
/// 十分に上回る一方、設定ミスや循環参照を実用上の上限として早期に打ち切る
/// ための保険として置いている。厳密な仕様上の限界ではなく、無限ループや
/// 異常に深いネストの検証コストを抑えるための値。引き上げると 1 タスクあたり
/// の親チェーン検証で辿るノード数が増えるため、深い階層を許容したい場合は
/// 検証コストへの影響を確認してから変更すること。
const MAX_PARENT_DEPTH: usize = 20;

/// `TaskIndex::cycle_members` の 3 色法で使う走査状態。
///
/// `InPath` は「今辿っている 1 本のパス上」を意味する。パスを抜けるたび全メンバを
/// `Settled` へ移すため、`InPath` に再訪したら必ず現在のパス上の閉路になる。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CycleScanState {
    Unseen,
    InPath,
    Settled,
}

/// `TaskIndex::build_forest_node` の反復 DFS で使う、組み立て途中の 1 段分。
///
/// 再帰を使わない代わりに、この Frame を `Vec` に積んで呼び出しスタックの役割を
/// 持たせる。関数内では定義せず module レベルに置く。
struct ForestFrame {
    task_index: usize,
    /// `adjacency[task_index]` のうち次に調べる位置
    cursor: usize,
    /// 組み立て済みの子ノード（隣接リストの入力順 = board 表示順）
    children: Vec<TaskTreeNode>,
}

impl ForestFrame {
    fn new(task_index: usize) -> Self {
        Self {
            task_index,
            cursor: 0,
            children: Vec::new(),
        }
    }
}

/// board 表示順に整列した tasks と、そこから導出した全 projection の束。
///
/// IPC には出さない（各 command が自分の payload struct へ詰め替える）。
/// `open_project` / `get_tasks` が「順序 → projection 群」の手順を各自にコピーしていた
/// 重複を解消し、projection を増やしたとき片側だけ更新し忘れる事故を型で防ぐための集約点。
///
/// `ClearChildrenOutcome` 等の `*Outcome` は `plan_*`（write の意図）に対する結果に付く
/// 命名なので、`project_*` query の束であるこちらは既存 projection 群に揃えて `*Projection`
/// とする。両 command が別の payload struct へ詰め替えるため `into_payload` は持たせず、
/// フィールドの直接読みとする。
pub(crate) struct TaskViewProjection {
    pub(crate) tasks: Vec<Task>,
    pub(crate) projections: TaskProjectionMap,
    pub(crate) milestone_projections: MilestoneProjectionMap,
    pub(crate) task_tree: TaskForest,
}

/// resolver前のcandidateはcrate外から参照できず、IPC型として使えない。
///
/// ```compile_fail,E0603
/// use spec_board_lib::task::task_index::ParsedTask;
/// ```
#[derive(Debug, Clone, PartialEq)]
pub struct Task {
    id: TaskFilePath,
    file_path: TaskFilePath,
    title: TaskTitle,
    status: ColumnName,
    priority: Option<Priority>,
    /// マイルストーン参照キー（単数の自由文字列）。未割当時は `None`。
    milestone: Option<String>,
    labels: Vec<Label>,
    /// 期限（`YYYY-MM-DD`）を表す `Due` VO。検証は parse 時に行い、不正でも原文を保持する。
    /// 表示用の typed フィールド（透過シリアライズで文字列）だが、round-trip 保持は extras 側が担う。
    due: Option<Due>,
    /// 下書きフラグ。false のときは payload にキーを出力しない（旧 FE との互換維持）。
    draft: bool,
    links: Vec<TaskFilePath>,
    body: String,
    /// Task struct の typed フィールド（title / status / priority / labels / parent /
    /// links）に該当しない frontmatter キーをそのまま保持する。FE 側で表示・編集される
    /// 拡張メタデータ（例: `assignee`, `due_date` 等）。
    /// key 順序を JSON シリアライズで安定させるため `BTreeMap` を採用。
    extras: BTreeMap<String, serde_json::Value>,
    parse_warnings: Vec<TaskWarning>,
    derived: DerivedTaskState,
}

/// resolver が Task 集合全体から確定する非公開状態。
///
/// `raw_parent` は disk 再構築用、`effective_parent` は cycle 正規化後の wire 値。
/// parse warningはTask本体とParsedTaskに残し、graph warningだけをここに保持する。
#[derive(Debug, Clone, PartialEq)]
struct DerivedTaskState {
    raw_parent: Option<TaskFilePath>,
    effective_parent: Option<TaskFilePath>,
    children: Vec<TaskFilePath>,
    reverse_links: Vec<TaskFilePath>,
    graph_warnings: Vec<TaskWarning>,
}

impl DerivedTaskState {
    fn new(raw_parent: Option<TaskFilePath>) -> Self {
        let effective_parent = raw_parent.clone();
        Self {
            raw_parent,
            effective_parent,
            children: Vec::new(),
            reverse_links: Vec::new(),
            graph_warnings: Vec::new(),
        }
    }
}

/// Markdown/frontmatter の parse だけが完了した task candidate。
///
/// IPC serialize と resident session への格納はできず、必ず [`ResolvedTaskSet`] の
/// resolver を通して [`Task`] へ変換する。
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ParsedTask {
    pub(crate) id: TaskFilePath,
    pub(crate) file_path: TaskFilePath,
    pub(crate) title: TaskTitle,
    pub(crate) status: ColumnName,
    pub(crate) priority: Option<Priority>,
    pub(crate) milestone: Option<String>,
    pub(crate) labels: Vec<Label>,
    pub(crate) parent: Option<TaskFilePath>,
    pub(crate) due: Option<Due>,
    pub(crate) draft: bool,
    pub(crate) links: Vec<TaskFilePath>,
    pub(crate) body: String,
    pub(crate) extras: BTreeMap<String, serde_json::Value>,
    pub(crate) parse_warnings: Vec<TaskWarning>,
}

impl ParsedTask {
    fn into_unresolved_task(self) -> Task {
        let raw_parent = self.parent.clone();
        let derived = DerivedTaskState::new(raw_parent);
        Task {
            id: self.id,
            file_path: self.file_path,
            title: self.title,
            status: self.status,
            priority: self.priority,
            milestone: self.milestone,
            labels: self.labels,
            due: self.due,
            draft: self.draft,
            links: self.links,
            body: self.body,
            extras: self.extras,
            parse_warnings: self.parse_warnings,
            derived,
        }
    }
}

/// canonical resolver を通過した task 集合。
///
/// field を公開せず、session/cache の replace 境界が parse-only candidate を受理しない
/// ことを型で保証する。
#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct ResolvedTaskSet {
    tasks: Vec<Task>,
}

impl ResolvedTaskSet {
    pub(crate) fn resolve_lenient(tasks: Vec<ParsedTask>) -> Result<Self, TaskParseError> {
        let tasks = tasks
            .into_iter()
            .map(ParsedTask::into_unresolved_task)
            .collect();
        let tasks = TaskIndex::new(tasks)
            .rebuild_derived_with_warnings()?
            .into_tasks();
        Ok(Self { tasks })
    }

    fn validate_strict(tasks: Vec<ParsedTask>) -> Result<(), TaskParseError> {
        TaskIndex::new(
            tasks
                .into_iter()
                .map(ParsedTask::into_unresolved_task)
                .collect(),
        )
        .validate_parent_hierarchy()
        .map(|_| ())
    }

    pub(crate) fn into_tasks(self) -> Vec<Task> {
        self.tasks
    }

    pub(crate) fn into_map(self) -> HashMap<CanonicalTaskPath, Task> {
        self.tasks
            .into_iter()
            .map(|task| (CanonicalTaskPath::from_file_path(&task.file_path), task))
            .collect()
    }

    pub(crate) fn get(&self, path: &CanonicalTaskPath) -> Option<&Task> {
        self.tasks
            .iter()
            .find(|task| CanonicalTaskPath::from_file_path(task.file_path()) == *path)
    }

    /// resident taskをdisk由来candidateへ戻し、canonical resolverを再実行する。
    pub(crate) fn reresolve(tasks: impl IntoIterator<Item = Task>) -> Result<Self, TaskParseError> {
        Self::resolve_lenient(
            tasks
                .into_iter()
                .map(|task| task.to_parsed_task())
                .collect(),
        )
    }
}

#[cfg(test)]
impl std::ops::Deref for ResolvedTaskSet {
    type Target = [Task];

    fn deref(&self) -> &Self::Target {
        &self.tasks
    }
}

#[cfg(test)]
pub(crate) fn resolve_parsed_for_test(task: ParsedTask) -> Task {
    ResolvedTaskSet::resolve_lenient(vec![task])
        .expect("fixture candidate should resolve")
        .into_tasks()
        .into_iter()
        .next()
        .expect("single fixture candidate should remain")
}

#[cfg(test)]
pub(crate) struct ParsedTaskBuilder {
    task: ParsedTask,
}

#[cfg(test)]
impl ParsedTaskBuilder {
    pub(crate) fn new(file_path: impl Into<TaskFilePath>) -> Self {
        let file_path = file_path.into();
        Self {
            task: ParsedTask {
                id: file_path.clone(),
                file_path,
                title: TaskTitle::from_lenient("Task"),
                status: ColumnName::from_lenient("Todo"),
                priority: None,
                milestone: None,
                labels: Vec::new(),
                parent: None,
                due: None,
                draft: false,
                links: Vec::new(),
                body: String::new(),
                extras: BTreeMap::new(),
                parse_warnings: Vec::new(),
            },
        }
    }

    pub(crate) fn id(mut self, id: impl Into<TaskFilePath>) -> Self {
        self.task.id = id.into();
        self
    }

    pub(crate) fn title(mut self, title: impl Into<TaskTitle>) -> Self {
        self.task.title = title.into();
        self
    }

    pub(crate) fn status(mut self, status: impl Into<ColumnName>) -> Self {
        self.task.status = status.into();
        self
    }

    pub(crate) fn milestone(mut self, milestone: Option<String>) -> Self {
        self.task.milestone = milestone;
        self
    }

    pub(crate) fn labels(mut self, labels: Vec<Label>) -> Self {
        self.task.labels = labels;
        self
    }

    pub(crate) fn parent(mut self, parent: Option<TaskFilePath>) -> Self {
        self.task.parent = parent;
        self
    }

    pub(crate) fn build(self) -> ParsedTask {
        self.task
    }

    pub(crate) fn resolve(self) -> Task {
        resolve_parsed_for_test(self.build())
    }
}

impl Task {
    pub fn id(&self) -> &TaskFilePath {
        &self.id
    }

    pub fn file_path(&self) -> &TaskFilePath {
        &self.file_path
    }

    pub fn title(&self) -> &TaskTitle {
        &self.title
    }

    pub fn status(&self) -> &ColumnName {
        &self.status
    }

    pub fn priority(&self) -> Option<Priority> {
        self.priority
    }

    pub fn milestone(&self) -> Option<&str> {
        self.milestone.as_deref()
    }

    pub fn labels(&self) -> &[Label] {
        &self.labels
    }

    /// cycle 時は `None` に正規化された wire 上の effective parent。
    pub fn parent(&self) -> Option<&TaskFilePath> {
        self.derived.effective_parent.as_ref()
    }

    pub fn due(&self) -> Option<&Due> {
        self.due.as_ref()
    }

    pub fn is_draft(&self) -> bool {
        self.draft
    }

    pub fn links(&self) -> &[TaskFilePath] {
        &self.links
    }

    pub fn children(&self) -> &[TaskFilePath] {
        &self.derived.children
    }

    pub fn reverse_links(&self) -> &[TaskFilePath] {
        &self.derived.reverse_links
    }

    pub fn body(&self) -> &str {
        &self.body
    }

    pub fn extras(&self) -> &BTreeMap<String, serde_json::Value> {
        &self.extras
    }

    pub fn warnings(&self) -> Vec<TaskWarning> {
        self.parse_warnings
            .iter()
            .chain(&self.derived.graph_warnings)
            .cloned()
            .collect()
    }

    pub(crate) fn to_parsed_task(&self) -> ParsedTask {
        ParsedTask {
            id: self.id.clone(),
            file_path: self.file_path.clone(),
            title: self.title.clone(),
            status: self.status.clone(),
            priority: self.priority,
            milestone: self.milestone.clone(),
            labels: self.labels.clone(),
            parent: self.derived.raw_parent.clone(),
            due: self.due.clone(),
            draft: self.draft,
            links: self.links.clone(),
            body: self.body.clone(),
            extras: self.extras.clone(),
            parse_warnings: self.parse_warnings.clone(),
        }
    }

    pub(crate) fn with_status_candidate(&self, status: &str) -> ParsedTask {
        let mut task = self.to_parsed_task();
        task.status = ColumnName::from_lenient(status);
        task
    }

    pub(in crate::task) fn clear_children_for_resolver(&mut self) {
        self.derived.children.clear();
    }

    pub(in crate::task) fn push_child_for_resolver(&mut self, child: TaskFilePath) {
        self.derived.children.push(child);
    }

    pub(in crate::task) fn clear_reverse_links_for_resolver(&mut self) {
        self.derived.reverse_links.clear();
    }

    pub(in crate::task) fn push_reverse_link_for_resolver(&mut self, source: TaskFilePath) {
        self.derived.reverse_links.push(source);
    }

    fn mark_parent_cycle_for_resolver(&mut self) {
        self.derived.effective_parent = None;
        ensure_parent_cycle_warning(&mut self.derived.graph_warnings);
    }

    fn reset_graph_for_resolver(&mut self) {
        self.derived.effective_parent = self.derived.raw_parent.clone();
        self.derived.children.clear();
        self.derived.reverse_links.clear();
        self.derived.graph_warnings.clear();
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

/// watcher が観測した外部由来の変更 1 件。
///
/// rename は fs 層で `removed(from)` + `upserted(to)` に分解されて届くため
/// （`crates/fs/src/watcher/file_change_batch.rs`）、rename 専用の variant は持たない。
/// `ParsedTask` は `TaskFilePath` より大きいため、variant 間の差を抑える目的で
/// `Upserted` だけ box に載せる。
pub(crate) enum ExternalTaskChange {
    /// 作成または更新。parse-only candidateで同一 path のslotを差し替える。
    Upserted(Box<ParsedTask>),
    /// 削除。この cache key のタスクを取り除く。
    Removed(TaskFilePath),
}

/// 外部変更を適用し、派生値を作り直した結果。
pub(crate) struct ExternalChangeOutcome {
    /// 派生再構築後の全タスク。cache をこれで丸ごと置き換える。
    pub(crate) tasks: ResolvedTaskSet,
    /// 変更対象のタスク自身（`Upserted` のときだけ `Some`）。
    /// emit する payload には parse 直後ではなくこちらを載せる。
    pub(crate) changed_task: Option<Task>,
    /// 変更対象以外に、内容が変わったタスクが 1 件以上あるか。
    /// true のとき呼び出し側は単体 envelope ではなく resync を要求する。
    pub(crate) other_tasks_changed: bool,
}

/// Task 集合の整合性（parent 存在 / 循環検出 / children・reverse_links 派生）を
/// 守る Aggregate。不変条件の検証メソッドを集約する。
#[derive(Debug, Clone, PartialEq)]
pub struct TaskIndex {
    tasks: Vec<Task>,
}

impl TaskIndex {
    pub(crate) fn new(tasks: Vec<Task>) -> Self {
        Self { tasks }
    }

    pub(crate) fn into_tasks(self) -> Vec<Task> {
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

    /// milestone ごとの進捗と所属 task path を1回の走査で集計する。
    ///
    /// `None` と空文字は未割当として除外し、空でない名称は config registry に
    /// 未定義でも raw 値のまま保持する。`done_column` が未解決なら完了件数は 0。
    /// `task_file_paths` は `self.tasks` の入力順をそのまま保持し、本 query では
    /// sort しない。payload の board order は command 層が先に task を並べ替えて
    /// `TaskIndex` を再構築することで保証する。I/O・config registry・Tauri 型には
    /// 依存しない。task 集合は1回だけ走査し、deterministic な `BTreeMap` への
    /// entry 操作を含む厳密な上界は O(tasks × log milestones)、追加領域は
    /// O(tasks)。milestone ごとの task 再走査は行わない。
    pub fn project_milestones(&self, done_column: Option<&ColumnName>) -> MilestoneProjectionMap {
        let mut projections = MilestoneProjectionMap::new();
        for task in &self.tasks {
            let Some(name) = task.milestone.as_deref().filter(|name| !name.is_empty()) else {
                continue;
            };
            let projection = projections.entry(name.to_owned()).or_default();
            projection.total += 1;
            if is_in_done_column(task, done_column) {
                projection.done += 1;
            }
            projection.task_file_paths.push(task.file_path.clone());
        }
        projections
    }

    /// 全タスク分の projection（子孫進捗 / 完了判定 / 直接子）をまとめて作る。
    ///
    /// **親子関係の入力は effective `Task.parent` であり `Task.children` ではない**。
    /// production の resident Task は canonical resolver が両方を同期済みにするが、
    /// projection 自身も入力の `parent` から adjacency を組み直し、派生値同士を
    /// 参照しない純粋な query として保つ。
    ///
    /// 集計は task 集合そのものから導出されるため、`plan_*`（write 系の意図 →
    /// outcome）ではなく `label_usage_counts` と同じ `&self` query として公開する。
    /// I/O・時計・乱数に依存しない pure method。
    ///
    /// 契約:
    /// - 集計対象は **全子孫**。root 自身は含まない
    /// - サイクル（A→B→A）・自己参照（A→A）でも有限ステップで停止する
    /// - 同じ子孫へ複数経路で到達しても 1 度だけ数える
    /// - `parent` が実在 task に解決できない task は、誰の直接子にもならない
    /// - `done_column` が `None` のとき `is_done` は常に false・done は 0
    /// - `child_file_paths` は `file_path` 昇順
    ///
    /// production の resident Task では resolver が cycle member の effective parent を
    /// `None` にする。ここでも cycle を打ち切るのは、query を直接組み立てる単体テストや
    /// 将来の adapter が不完全な入力を渡しても無限走査しないための防御である。
    ///
    /// **計算量の契約**: lookup index と children adjacency の構築は本 method
    /// 1 呼び出しにつき各 1 回だけ（`children_paths_of` を task 数ぶん呼ぶ O(N^2)
    /// 実装は禁止）。ただし集計本体は root ごとの DFS であり、訪問回数は
    /// Σ(各 root の子孫数) になる。直線チェーン状のデータでは最悪 O(N×depth) と
    /// なることを許容する（bottom-up メモ化による O(N) 集約は follow-up 候補）。
    pub fn project_all(&self, done_column: Option<&ColumnName>) -> TaskProjectionMap {
        let index = task_lookup_index(&self.tasks);
        let adjacency = self.build_child_adjacency(&index);
        self.tasks
            .iter()
            .enumerate()
            .map(|(root_index, root)| {
                let sub_issue_progress =
                    self.collect_descendant_progress(root_index, &adjacency, done_column);
                let child_file_paths = adjacency[root_index]
                    .iter()
                    .map(|&child_index| self.tasks[child_index].file_path.clone())
                    .collect();
                (
                    root.file_path.as_str().to_owned(),
                    TaskProjection {
                        sub_issue_progress,
                        is_done: is_in_done_column(root, done_column),
                        child_file_paths,
                    },
                )
            })
            .collect()
    }

    /// 直接の子の adjacency を **`file_path` 昇順**で構築する。
    ///
    /// `TaskProjection::child_file_paths` の並び順契約を担うのはこちら。整列が要るのは
    /// `self.tasks` の並びが `HashMap::values()` 由来で非決定的なためで、tasks 順を
    /// そのまま採用すると payload が実行ごとに揺れる。
    ///
    /// 入力順のまま欲しい場合は [`Self::build_child_adjacency_in_input_order`] を使う。
    fn build_child_adjacency(&self, index: &HashMap<String, usize>) -> Vec<Vec<usize>> {
        let mut adjacency = self.build_child_adjacency_in_input_order(index);
        for children in adjacency.iter_mut() {
            children.sort_by(|&a, &b| self.tasks[a].file_path.cmp(&self.tasks[b].file_path));
        }
        adjacency
    }

    /// 直接の子の adjacency を **`self.tasks` の入力順**で構築する。
    ///
    /// 並び順の契約は持たない。`file_path` 昇順が要る呼び出し側は
    /// [`Self::build_child_adjacency`] を通すこと。`project_forest` は兄弟順に
    /// board 表示順（= command 層が渡す入力順）を要求するため、整列前のこちらを使う。
    ///
    /// `path_lookup::parent_lookup_index` は使わない。あちらが返すのは
    /// `HashMap<正規化 child path, Option<正規化 parent path>>` で、adjacency を組むには
    /// parent path → index の変換に結局 `task_lookup_index` が要り、HashMap が 2 本になる。
    ///
    /// 自己参照（`parent` が自分自身）は載せない（`children_paths_of` の自己除外と同じ）。
    /// 載せると DFS が自分自身を子として展開しかけ、`visited` 依存でしか止まらなくなる。
    fn build_child_adjacency_in_input_order(
        &self,
        index: &HashMap<String, usize>,
    ) -> Vec<Vec<usize>> {
        let mut adjacency: Vec<Vec<usize>> = vec![Vec::new(); self.tasks.len()];
        for (child_index, task) in self.tasks.iter().enumerate() {
            let Some(parent) = task.parent() else {
                continue;
            };
            let Some(parent_norm) = normalize_parent_path_for_lookup(parent.as_str()) else {
                continue;
            };
            let Some(&parent_index) = index.get(&parent_norm) else {
                continue;
            };
            if parent_index == child_index {
                continue;
            }
            adjacency[parent_index].push(child_index);
        }
        adjacency
    }

    /// 親子階層のネストツリーを組み立てる。
    ///
    /// **契約**: 全 task がちょうど 1 回出現する。**root 列と兄弟列はともに
    /// `self.tasks` の入力順**（command 層が `sorted_by_board_order` 済みで渡すため
    /// board 表示順）。
    ///
    /// **root になるのは「親を持たない task」と「閉路そのもののメンバ全員」**。
    /// 閉路にぶら下がるだけの子孫は親配下に残す。この規則は canonical resolver が
    /// 閉路メンバ全員の effective `parent` を `None` 化するのと同じ木の形になるよう
    /// 合わせたもの。片方だけ
    /// 「閉路の先頭 1 件が root で残りはその子」にすると、同じ循環データが
    /// resolver 前後で違う形に描画されてしまう。
    ///
    /// production resident は resolver 済みだが、直接入力に対する query 自体の有限性も
    /// 保つため cycle 判定を持つ（`project_all` の doc と同じ理由）。
    ///
    /// 到達可能性を別に計算しないのは、root 候補以外は親を辿れば必ず root 候補に
    /// 行き着くため（親を持ち閉路にも乗らない task の親チェーンは、有限長で
    /// 自然 root か閉路メンバのどちらかに到達する）。したがって board 順に 1 周
    /// するだけで、子が親より前に居ても root 列には出ない。
    ///
    /// 移管元の FE 実装は閉路メンバを「到達できなかった残り」として root 列の**末尾へ
    /// append** していたが、それは採らない。FE 側の枝刈り（`TaskForest.prune`）は
    /// 可視集合を board 順に走査するので末尾 append を保存できず、BE と FE で root 順の
    /// 規則が食い違う。root 列に例外規則を作らず board 順 1 本に揃える。
    ///
    /// 計算量は隣接リスト構築 + 閉路判定 + emit DFS の各 O(N + E)。
    pub fn project_forest(&self) -> TaskForest {
        let index = task_lookup_index(&self.tasks);
        let adjacency = self.build_child_adjacency_in_input_order(&index);

        // has_parent と、child -> parent の逆引き（`cycle_members` が親方向に辿るのに使う）を
        // 隣接リストの 1 周で同時に作る。
        let mut has_parent = vec![false; self.tasks.len()];
        let mut parent_of: Vec<Option<usize>> = vec![None; self.tasks.len()];
        for (parent_index, children) in adjacency.iter().enumerate() {
            for &child_index in children {
                has_parent[child_index] = true;
                parent_of[child_index] = Some(parent_index);
            }
        }

        let on_cycle = self.cycle_members(&parent_of);

        let mut emitted = vec![false; self.tasks.len()];
        let mut roots: TaskForest = Vec::new();
        for root_index in 0..self.tasks.len() {
            let is_root = !has_parent[root_index] || on_cycle[root_index];
            if emitted[root_index] || !is_root {
                continue;
            }
            roots.push(self.build_forest_node(root_index, &adjacency, &on_cycle, &mut emitted));
        }
        roots
    }

    /// parent ポインタの閉路上に居る task を true にして返す。
    ///
    /// 各 task の parent は高々 1 つなので、閉路を含む成分は「1 本の閉路 + そこに
    /// ぶら下がる木」の形にしかならない。したがって閉路の判定は parent 方向へ辿って
    /// 自分の走査パス上に戻るかを見るだけでよい（既存
    /// `walk_parent_chain_collecting_cycle` と同じ親方向の走査。あちらは正規化文字列を
    /// `HashSet` に積む起点ごとの走査で、index ベースの O(N) 判定には流用できない）。
    ///
    /// 自己参照（`parent` が自分自身）は隣接に載せないので `has_parent == false` に
    /// なり、ここへは来ない（自然 root として扱われる）。
    ///
    /// `Unseen` / `InPath`（今辿っている 1 本のパス上）/ `Settled`（判定済み）の
    /// 3 色法。パスを抜けるたび全メンバを `Settled` にするため、`InPath` に当たるのは
    /// 必ず**現在のパス**上であり、そこから末尾までが閉路になる。パスより手前は
    /// 閉路に**ぶら下がっている**だけなので false のまま残す。各 task は高々 1 回
    /// `InPath` になり 1 回 `Settled` になるだけなので全体で O(N)。
    fn cycle_members(&self, parent_of: &[Option<usize>]) -> Vec<bool> {
        let mut scan_state = vec![CycleScanState::Unseen; self.tasks.len()];
        let mut on_cycle = vec![false; self.tasks.len()];
        let mut path: Vec<usize> = Vec::new();

        for start in 0..self.tasks.len() {
            if scan_state[start] != CycleScanState::Unseen {
                continue;
            }
            path.clear();
            let mut cursor = Some(start);
            while let Some(current) = cursor {
                match scan_state[current] {
                    CycleScanState::Unseen => {
                        scan_state[current] = CycleScanState::InPath;
                        path.push(current);
                        cursor = parent_of[current];
                    }
                    CycleScanState::InPath => {
                        for &member in path.iter().rev() {
                            on_cycle[member] = true;
                            if member == current {
                                break;
                            }
                        }
                        cursor = None;
                    }
                    CycleScanState::Settled => {
                        cursor = None;
                    }
                }
            }
            for &visited in &path {
                scan_state[visited] = CycleScanState::Settled;
            }
        }
        on_cycle
    }

    /// `root_index` を根とする部分木を組み立てる。**出力済みの子と、それ自身が
    /// root になる子（閉路メンバ）は children から落とす**。前者は同一 task の
    /// 二重出現を防ぎ、後者は「閉路メンバは全員 root」という契約を保つ
    /// （A↔B の閉路なら A の children に B を入れない。B は B 自身の番で root として出る）。
    ///
    /// `emitted` を root をまたいで共有するのは、「全 task がちょうど 1 回」を
    /// 「親は高々 1 つ」という入力側の不変条件ではなく走査側の構造で保証するため。
    /// 既存 `collect_descendant_progress` の `visited` は root ごとにローカルなので
    /// 流用できない。
    ///
    /// **明示 stack による反復で書く**。理由は 2 つ:
    /// 1. `task_index.rs` の既存 DFS（`collect_descendant_progress` 等）がすべて反復で、
    ///    このファイルの流儀に揃える。
    /// 2. production resident は resolver で深さ検証済みだが、この query を直接使う
    ///    テスト入力にも再帰深度を依存させない。
    fn build_forest_node(
        &self,
        root_index: usize,
        adjacency: &[Vec<usize>],
        on_cycle: &[bool],
        emitted: &mut [bool],
    ) -> TaskTreeNode {
        emitted[root_index] = true;
        let mut frames = vec![ForestFrame::new(root_index)];

        loop {
            let frame = frames
                .last_mut()
                .expect("root frame は確定と同時に return するため loop 中は空にならない");
            let siblings = &adjacency[frame.task_index];

            if frame.cursor < siblings.len() {
                let child_index = siblings[frame.cursor];
                frame.cursor += 1;
                if emitted[child_index] || on_cycle[child_index] {
                    continue;
                }
                emitted[child_index] = true;
                frames.push(ForestFrame::new(child_index));
                continue;
            }

            let task_index = frame.task_index;
            let children = std::mem::take(&mut frame.children);
            frames.pop();
            let node = TaskTreeNode {
                file_path: self.tasks[task_index].file_path.clone(),
                children,
            };
            match frames.last_mut() {
                Some(parent) => parent.children.push(node),
                None => return node,
            }
        }
    }

    /// tasks を board 表示順へ整列し、同じ ordered 集合から全 projection を導出する。
    ///
    /// tasks / projections / milestone_projections / task_tree が**同一スナップショット
    /// かつ同一順序**であることが FE 側の契約（`taskTree` は `tasks` の filePath 集合と
    /// 過不足なく一致する）なので、この関数以外で payload を組み立ててはならない。
    ///
    /// lookup index と隣接リストは `project_all` と `project_forest` で各 1 回、
    /// payload 1 回あたり計 2 回構築される（各 O(N + E) なので合計も O(N + E)）。
    /// 1 回に減らす共有化は既存 query の signature を変えるため、本 PR では採らない。
    pub(crate) fn project_board_view(tasks: Vec<Task>, config: &Config) -> TaskViewProjection {
        let ordered_tasks = TaskIndex::new(tasks).sorted_by_board_order(config);
        let index = TaskIndex::new(ordered_tasks);
        // done column は借用のまま渡す（`get_tasks` 側にだけあった `.cloned()` の非対称は
        // この単一入口へ寄せることで消える）。
        let done_column = config.resolved_done_column();
        let projections = index.project_all(done_column);
        let milestone_projections = index.project_milestones(done_column);
        let task_tree = index.project_forest();
        TaskViewProjection {
            tasks: index.into_tasks(),
            projections,
            milestone_projections,
            task_tree,
        }
    }

    /// root を起点に adjacency を DFS して完了数 / 総数を数える（root 自身は除外）。
    ///
    /// `visited` は正規化文字列ではなく task index で持つ（正規化は adjacency 構築時に
    /// 済んでいるため、走査中に文字列正規化を繰り返さない）。
    fn collect_descendant_progress(
        &self,
        root_index: usize,
        adjacency: &[Vec<usize>],
        done_column: Option<&ColumnName>,
    ) -> SubIssueProgress {
        let mut visited: HashSet<usize> = HashSet::new();
        // root 自身を先に visited へ入れ、サイクルでも root を混入させない。
        visited.insert(root_index);
        let mut stack: Vec<usize> = adjacency[root_index].iter().rev().copied().collect();
        let mut progress = SubIssueProgress::default();
        while let Some(child_index) = stack.pop() {
            if !visited.insert(child_index) {
                continue;
            }
            progress.total += 1;
            if is_in_done_column(&self.tasks[child_index], done_column) {
                progress.done += 1;
            }
            stack.extend(adjacency[child_index].iter().rev().copied());
        }
        progress
    }

    /// aggregate が保持する `Task` を `id` 昇順に並べた `Vec<Task>` を返す。
    ///
    /// board へ返す通常経路は [`Self::sorted_by_board_order`] であり、本メソッドは
    /// **`Config` を解決できない場合のフォールバック**（project 未オープンなど）に使う。
    /// `Vec::sort_by` は安定ソートのため、同一 `id` の `Task` が混入した場合は入力順を
    /// 保持する。aggregate を再利用しない読み取り用途のため `self` を消費する。
    pub fn sorted_by_id(self) -> Vec<Task> {
        let mut tasks = self.into_tasks();
        tasks.sort_by(|a, b| a.id.cmp(&b.id));
        tasks
    }

    /// board の表示順（カラム表示順 → カラム内 `cardOrder` の並び → `id` 昇順）で
    /// `Task` を並べ替えて返す。
    ///
    /// FE はカラムごとに `tasks` を filter して**配列順をそのまま表示順**に使うため、
    /// この並べ替えが「再オープンしても DnD で決めた並びが復元される」ための
    /// rehydration になる。`open_project` と `get_tasks` の両方が同じ入口を通ることで、
    /// full rescan / gap 復旧のたびに並びが id 順へ崩れるのを防ぐ。
    ///
    /// `cardOrder` に載っていないタスク（新規追加された md 等）はそのカラムの末尾へ
    /// `id` 昇順で並ぶ。`columns` のいずれにも一致しない `status` のタスクは全カラムの
    /// 後ろへ回す。
    pub fn sorted_by_board_order(self, config: &Config) -> Vec<Task> {
        let mut sorted_columns: Vec<&Column> = config.columns.iter().collect();
        sorted_columns.sort_by_key(|column| column.order);
        let column_rank: HashMap<&str, usize> = sorted_columns
            .iter()
            .enumerate()
            .map(|(rank, column)| (column.name.as_str(), rank))
            .collect();
        let unknown_column_rank = sorted_columns.len();

        let mut tasks = self.into_tasks();
        // `sort_by` で比較のたびに cardOrder を線形探索すると、比較回数ぶん走査が
        // 繰り返される。key は 1 task につき 1 回だけ計算する。
        tasks.sort_by_cached_key(|task| {
            let (rank, position) = card_sort_key(task, config, &column_rank, unknown_column_rank);
            (rank, position, task.id.clone())
        });
        tasks
    }

    /// 指定カラムの board 表示順を file_path 列として返す。
    ///
    /// `config.card_order` の生値ではなく「実際に board へ表示される順」を返す。
    /// cardOrder に載っているタスクはその順、載っていないタスクは末尾へ `id` 昇順で
    /// 並ぶ。cardOrder の生値と比較すると、一度も並び替えていないカラム（エントリ
    /// 自体が無い）への移動が必ず不一致になってしまう。
    ///
    /// `card_sort_key` を再利用しないのは、あちらが全カラム対象の
    /// `(カラム順位, カラム内順位)` を返す設計で、呼び出し側に `column_rank` の
    /// HashMap 組み立てを要求するため（単一カラムではカラム順位が不要）。並びの
    /// 規則は [`Self::sorted_by_board_order`] と同一でなければならず、両者の一致は
    /// テストで固定している。
    pub(crate) fn board_order_of_column(&self, config: &Config, column: &str) -> Vec<String> {
        let mut members: Vec<&Task> = self
            .tasks
            .iter()
            .filter(|task| task.status.as_str() == column)
            .collect();
        members.sort_by_cached_key(|task| {
            let position = card_position_in_column(config, column, task.file_path.as_str());
            (position, task.id.clone())
        });
        members
            .into_iter()
            .map(|task| task.file_path.as_str().to_string())
            .collect()
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

    /// lenient resolver用。親チェーンに循環が含まれる場合は Err を返さず、ループ内の
    /// 全 task に `parentCycle` warning を付けてeffective `parent = None` にすることで
    /// 全体を継続させる。raw parentは保持する。親チェーンの深さが
    /// `MAX_PARENT_DEPTH` を超える (TooDeep) 場合のみ `Err` を返す。
    ///
    /// 既存 `build_children` と同様、最初に `validate_parent_existence` を
    /// 実行して `ParentNotFound` warning を従来通り付与する。children 構築は
    /// 循環ノードのeffective `parent` を `None` 化した後に行うため、cycle member は
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
            task.mark_parent_cycle_for_resolver();
        }
    }

    /// children を逆引きで構築するが、parent chain の hierarchy 検証は行わない。
    /// `build_children_with_warnings` が cycle member のeffective `parent` を `None` 化した
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

    /// disk 全体から作り直した `Task` 集合に対し、parent hierarchy 検証
    /// （循環は warning として task に残す）→ `children` 再構築 →
    /// `reverse_links` 再構築までを一括で行う aggregate メソッド。
    ///
    /// `open_project`（初回ロード）、各 mutation、`watcher_event` が同じ全件 resolver
    /// を通ることで、派生値の構築順序が経路ごとにずれることを構造的に防ぐ。
    ///
    /// 循環を `Err` にせず warning に倒し、1 箇所の循環でproject全体のロードや
    /// mutation後の再解決を失敗させない。
    ///
    /// 先頭で `file_path` 昇順に整列するのは、`children` / `reverse_links` の並びが
    /// 入力順で決まるため。disk 走査順（`WalkDir`）と resident cache の `HashMap`
    /// iteration 順は一致しないので、ここで正規化しないと「watcher 適用後 == 再 open」
    /// が成立しない。1 段下の `build_children_with_warnings` に移すと、入力順を固定
    /// している直呼びのテストと forest 形状の一致検証が片側だけ並び替わって壊れる。
    pub(crate) fn rebuild_derived_with_warnings(mut self) -> Result<Self, TaskParseError> {
        self.tasks
            .sort_by(|a, b| a.file_path.as_str().cmp(b.file_path.as_str()));
        self.build_children_with_warnings()
            .map(Self::build_reverse_links)
    }

    /// 外部（watcher）由来の 1 件の変更を適用し、全タスクの派生値を作り直す。
    ///
    /// 「watcher 適用後の state == 同じ disk 状態で開き直した state」を成立させる
    /// ため、`open_project` / full rescan と同じ [`Self::rebuild_derived_with_warnings`]
    /// を通す。外部エディタが一時的に循環を作っただけでイベント処理が止まっては
    /// ならないので、循環は warning に倒す scan 経路と同じ意味論を使う。`Err` に
    /// なるのは階層が深すぎる場合だけ。
    ///
    /// frontmatter 由来の `parent` / `links` は書き換えない。消えたタスクへの参照は
    /// 値を保持したまま warning / 壊れたリンク表示に委ねる。消えるのは派生値である
    /// `children` / `reverse_links` だけ。
    pub(crate) fn rebuild_with_external_change(
        self,
        change: ExternalTaskChange,
    ) -> Result<ExternalChangeOutcome, TaskParseError> {
        let before = self.tasks.clone();
        let mut candidates: Vec<ParsedTask> = self
            .tasks
            .into_iter()
            .map(|task| task.to_parsed_task())
            .collect();
        let target = match &change {
            ExternalTaskChange::Upserted(task) => {
                normalize_task_path_for_lookup(task.file_path.as_str())
            }
            ExternalTaskChange::Removed(path) => normalize_task_path_for_lookup(path.as_str()),
        };

        match change {
            ExternalTaskChange::Upserted(task) => {
                match candidates
                    .iter_mut()
                    .find(|t| normalize_task_path_for_lookup(t.file_path.as_str()) == target)
                {
                    Some(slot) => *slot = *task,
                    None => candidates.push(*task),
                }
            }
            ExternalTaskChange::Removed(_) => {
                candidates
                    .retain(|t| normalize_task_path_for_lookup(t.file_path.as_str()) != target);
            }
        }

        let tasks = ResolvedTaskSet::resolve_lenient(candidates)?;
        let changed_task = tasks
            .tasks
            .iter()
            .find(|t| normalize_task_path_for_lookup(t.file_path.as_str()) == target)
            .cloned();
        let other_tasks_changed = other_tasks_differ(&before, &tasks.tasks, &target);

        Ok(ExternalChangeOutcome {
            tasks,
            changed_task,
            other_tasks_changed,
        })
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
    fn validate_with_new_task(
        &self,
        new_task: &ParsedTask,
        raw_parent_input: Option<&str>,
    ) -> Result<(), ParentValidationFailure> {
        let mut augmented: Vec<ParsedTask> = self.tasks.iter().map(Task::to_parsed_task).collect();
        augmented.push(new_task.clone());
        match ResolvedTaskSet::validate_strict(augmented) {
            Ok(()) => Ok(()),
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
                            reason: "タイトルからファイル名を生成できません".to_string(),
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
    /// 3. patch 適用 + `TaskDocument::render` で `String` を構築
    /// 4. `TaskContent::try_new(String)` で eligibility 検証
    /// 5. `task_from_parsed` を呼び直して updated_task を再構築し warning を再生成
    pub(crate) fn plan_update(
        &self,
        _project_root: &Path,
        intent: UpdateTaskIntent,
        existing: &Task,
        existing_parsed: Parsed,
    ) -> Result<UpdateTaskOutcome, UpdateTaskError> {
        let mut document = TaskDocument::from_parsed(existing_parsed);
        let parent_changed = match &intent.parent {
            None => false,
            Some(s) if s.is_empty() => document.has_extra("parent") || existing.parent().is_some(),
            Some(s) => {
                // 正規化済み lookup key で比較する。raw string equality だと
                // `./tasks/p.md` / `tasks\p.md` 等の表記揺れで同一 task を指していても
                // changed と誤判定し、不要な full rebuild と非正規形での書き戻しを招く。
                let new_normalized = normalize_parent_path_for_lookup(s);
                let existing_normalized = existing
                    .parent()
                    .and_then(|p| normalize_parent_path_for_lookup(p.as_str()));
                new_normalized != existing_normalized
            }
        };

        let patch = TaskPatch {
            title: intent
                .title
                .clone()
                .map(Patch::Set)
                .unwrap_or(Patch::Unchanged),
            status: intent
                .status
                .clone()
                .map(Patch::Set)
                .unwrap_or(Patch::Unchanged),
            priority: intent.priority.map(Patch::Set).unwrap_or(Patch::Unchanged),
            labels: intent
                .labels
                .clone()
                .map(Patch::Set)
                .unwrap_or(Patch::Unchanged),
            milestone: match intent.milestone.clone() {
                None => Patch::Unchanged,
                Some(value) if value.is_empty() => Patch::Clear,
                Some(value) => Patch::Set(value),
            },
            parent: match intent.parent.clone() {
                None => Patch::Unchanged,
                Some(value) if value.is_empty() => Patch::Clear,
                Some(value) => Patch::Set(value),
            },
            links: Patch::Unchanged,
            draft: match intent.draft {
                None => Patch::Unchanged,
                Some(true) => Patch::Set(true),
                Some(false) => Patch::Clear,
            },
            due: Patch::Unchanged,
            body: intent
                .body
                .clone()
                .map(Patch::Set)
                .unwrap_or(Patch::Unchanged),
        };
        document
            .apply(patch)
            .map_err(|error| UpdateTaskError::DocumentRender(error.to_string()))?;

        if let Some(parent_str) = intent.parent.as_deref().filter(|s| !s.is_empty()) {
            if resolve_parent_for_new_task(parent_str, self.as_slice()).is_none() {
                return Err(UpdateTaskError::ParentNotFound {
                    path: parent_str.to_string(),
                });
            }
        }

        if parent_changed {
            let preliminary_task = build_patched_task(existing, &intent);
            let mut values: Vec<ParsedTask> =
                self.as_slice().iter().map(Task::to_parsed_task).collect();
            let target_key = intent.file_path.to_string_lossy();
            if let Some(slot) = values
                .iter_mut()
                .find(|t| t.file_path.as_str() == target_key.as_ref())
            {
                *slot = preliminary_task;
            } else {
                values.push(preliminary_task);
            }
            ResolvedTaskSet::validate_strict(values).map_err(UpdateTaskError::from)?;
        }

        let serialized = document
            .render()
            .map_err(|error| UpdateTaskError::DocumentRender(error.to_string()))?;

        TaskContent::try_new(serialized.clone()).map_err(UpdateTaskError::from)?;

        let context = TaskParseContext {
            file_path: existing.file_path.as_path_buf(),
            default_status: existing.status.clone(),
        };
        let updated_task = document.to_parsed_task(&context);

        Ok(UpdateTaskOutcome {
            updated_task,
            file_content: serialized,
        })
    }

    /// タスク移動の計算を行う pure aggregate method。
    ///
    /// 呼び出し前提:
    ///
    /// - `existing` は effect 層が cache snapshot から `intent.file_path` で
    ///   引き当て済みの `&Task`。
    /// - `existing_parsed` は effect 層が `io.read` + `frontmatter::parse_bytes` 済み。
    ///
    /// 振る舞い（検証は status 照合 → 並び照合 → 書き込み計画の順）:
    ///
    /// 1. cache 上の `existing.status` と、md から解決した実効 status の**両方**が
    ///    `intent.from_column` と一致することを要求し、外れていれば `StatusMismatch`
    ///    で reject する。同一カラム並び替えでも先に検証するため、stale な状態の
    ///    まま cardOrder だけが書き換わることはない。md の実効 status は `status:` が
    ///    文字列で読めればその値、欠落 / 非文字列なら `scan_default_status`
    ///    （scan 時に割り当てられる既定値。決定は Config のドメインなので effect 層が解決）。
    /// 2. 移動先カラムの board 表示順が `intent.expected_to_column_order` と一致する
    ///    ことを要求し、外れていれば `CardOrderConflict` で reject する。同一カラム
    ///    並び替えも対象（宛先＝移動元なので期待値は移動前の自分を含む並び）。
    /// 3. `from_column == to_column` なら `SameColumn` を返す。task md は変更しない。
    /// 4. それ以外は frontmatter の `status` を `to_column` に書き換え、
    ///    serialize 済み `file_content` と再構築した `updated_task` を返す。
    ///
    /// cardOrder の**書き込み内容**は Config 側のドメインのため本メソッドでは扱わない。
    /// effect 層が `Config::plan_update_card_order` を呼んで別途計算する（`config` は
    /// 並び照合の読み取りにのみ使う）。
    /// 移動先カラムの並びが FE の前提と一致するかを検証する。
    ///
    /// 一致しない場合は「他の変更が先に入っている」ことを意味するため、
    /// 書き込みを一切行わずに reject する。移動元カラムは照合しない（移動元への
    /// 操作は対象を取り除くだけで、他のカードの並びが変わっていても結果が
    /// 変わらない冪等な操作。照合すると無関係な並び替えで誤検知する）。
    pub(crate) fn ensure_to_column_order_matches(
        &self,
        config: &Config,
        intent: &MoveTaskIntent,
    ) -> Result<(), MoveTaskError> {
        let actual = self.board_order_of_column(config, &intent.to_column);
        if actual == intent.expected_to_column_order {
            return Ok(());
        }
        Err(MoveTaskError::CardOrderConflict {
            column: intent.to_column.clone(),
            expected: intent.expected_to_column_order.clone(),
            actual,
        })
    }

    pub(crate) fn plan_move(
        &self,
        intent: &MoveTaskIntent,
        existing: &Task,
        existing_parsed: Parsed,
        scan_default_status: &str,
        config: &Config,
    ) -> Result<MoveTaskOutcome, MoveTaskError> {
        ensure_status_matches(intent, existing.status.as_str())?;
        // cache は watcher 反映待ちで古くなり得るため、直前に読んだ md の値でも検証する。
        // 片方だけを信じると、外部エディタで status を変えられた直後の移動で
        // その変更を握り潰して上書きしてしまう。`status:` が欠落 / 非文字列の md は
        // scan と同じ既定 status が実効値になるため、そちらと突き合わせる。
        let document = TaskDocument::from_parsed(existing_parsed);
        let effective_on_disk = document.status_raw().unwrap_or(scan_default_status);
        ensure_status_matches(intent, effective_on_disk)?;

        // 並びの照合は status 照合の後・書き込み内容の組み立て前。ここで reject
        // すれば呼び出し元は書き込みを 1 バイトも行わない。
        self.ensure_to_column_order_matches(config, intent)?;

        if intent.from_column == intent.to_column {
            return Ok(MoveTaskOutcome::SameColumn {
                existing_task: existing.clone(),
            });
        }

        let mut document = document;
        document
            .apply(TaskPatch {
                status: Patch::Set(intent.to_column.clone()),
                ..TaskPatch::default()
            })
            .map_err(|error| MoveTaskError::DocumentRender(error.to_string()))?;

        let file_content = document
            .render()
            .map_err(|error| MoveTaskError::DocumentRender(error.to_string()))?;

        // 書き込んだ結果が scanner の受理条件から外れると、移動は成功したのに
        // 次の再スキャンで task が消える。plan_update / plan_add_link と同様に
        // 書き込み前に aggregate 側で弾く。
        TaskContent::try_new(file_content.clone()).map_err(MoveTaskError::from)?;

        let context = TaskParseContext {
            file_path: existing.file_path.as_path_buf(),
            default_status: existing.status.clone(),
        };
        let updated_task = document.to_parsed_task(&context);

        Ok(MoveTaskOutcome::CrossColumn {
            updated_task,
            file_content,
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
    /// 5. それ以外は `links` 末尾に正規化済み相対 path を push し、`TaskDocument::render`
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

        let document = TaskDocument::from_parsed(source_parsed);
        let existing_set: HashSet<String> = document
            .links()
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

        let mut document = document;
        let mut links = document.links().to_vec();
        links.push(push_str);
        document
            .apply(TaskPatch {
                links: Patch::Set(links),
                ..TaskPatch::default()
            })
            .map_err(|error| AddLinkError::DocumentRender(error.to_string()))?;

        let file_content = document
            .render()
            .map_err(|error| AddLinkError::DocumentRender(error.to_string()))?;
        TaskContent::try_new(file_content.clone()).map_err(AddLinkError::from)?;

        let context = TaskParseContext {
            file_path: source_existing.file_path.as_path_buf(),
            default_status: source_existing.status.clone(),
        };
        let updated_task = document.to_parsed_task(&context);

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
    /// 4. 除去ありなら `TaskDocument::render` で書き戻し用 string を生成し、
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

        let mut document = TaskDocument::from_parsed(source_parsed);
        let original_links = document.links().to_vec();
        let links: Vec<String> = original_links
            .iter()
            .filter(|link| {
                normalize_link_path_for_lookup(link).as_deref() != Some(target_norm.as_str())
            })
            .cloned()
            .collect();
        if links.len() == original_links.len() {
            return Ok(RemoveLinkOutcome::NoOp {
                existing_task: source_existing.clone(),
            });
        }

        document
            .apply(TaskPatch {
                links: Patch::Set(links),
                ..TaskPatch::default()
            })
            .map_err(|error| RemoveLinkError::DocumentRender(error.to_string()))?;
        let file_content = document
            .render()
            .map_err(|error| RemoveLinkError::DocumentRender(error.to_string()))?;
        TaskContent::try_new(file_content.clone()).map_err(RemoveLinkError::from)?;

        let context = TaskParseContext {
            file_path: source_existing.file_path.as_path_buf(),
            default_status: source_existing.status.clone(),
        };
        let updated_task = document.to_parsed_task(&context);

        Ok(RemoveLinkOutcome::Write {
            updated_task,
            file_content,
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
                let parent = t.parent()?;
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
            let mut document = TaskDocument::from_parsed(parsed);
            document
                .apply(TaskPatch {
                    parent: Patch::Clear,
                    ..TaskPatch::default()
                })
                .map_err(|error| ClearChildrenError::DocumentRender {
                    path: path.clone(),
                    reason: error.to_string(),
                })?;

            let serialized =
                document
                    .render()
                    .map_err(|error| ClearChildrenError::DocumentRender {
                        path: path.clone(),
                        reason: error.to_string(),
                    })?;

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
            let updated_task = document.to_parsed_task(&context);

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
    pub(crate) updated_task: ParsedTask,
    pub file_content: String,
}

/// `move_task` IPC 境界から domain に渡される移動意図。
///
/// `from_column` は「移動前にこうであるはず」という期待値で、実際の status と
/// 一致しなければ `plan_move` が `StatusMismatch` で reject する。
/// `to_column_file_paths` は cardOrder の再構築に使うため effect 層のみが参照する。
#[derive(Debug, Clone)]
pub(crate) struct MoveTaskIntent {
    /// 対象タスクのプロジェクトルート相対パス（正規化済み）。
    pub file_path: PathBuf,
    pub from_column: String,
    pub to_column: String,
    /// 移動先カラムの新しい cardOrder（FE が算出済みの完全な並び）。
    pub to_column_file_paths: Vec<String>,
    /// 移動先カラムの移動前の並びとして FE が前提にしていた値。
    /// resident な board 表示順と食い違う場合は移動を reject する。
    pub expected_to_column_order: Vec<String>,
}

/// `TaskIndex::plan_move` の計算結果。effect 層が消費する。
#[derive(Debug)]
pub(crate) enum MoveTaskOutcome {
    /// カラム間移動: status 変更あり。task md の書き込みが必要。
    CrossColumn {
        updated_task: ParsedTask,
        file_content: String,
    },
    /// 同一カラム並び替え: task 自体は変わらない。cardOrder のみ更新する。
    SameColumn { existing_task: Task },
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
        updated_task: ParsedTask,
        file_content: String,
        /// effect 層が cache 上の target エントリを引くための正規化済み相対 path。
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
        updated_task: ParsedTask,
        file_content: String,
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
    /// document から再parseした candidate（effect 層が resolver に渡す）。
    pub updated_task: ParsedTask,
    /// `TaskDocument::render` 出力（effect 層が `io.write_existing` で書き戻す）。
    pub file_content: String,
}

/// `TaskIndex::plan_clear_children_of` のエラー。
///
/// pure 関数のため I/O 系 variant は持たない。それらは effect 層が独自エラー型に詰め直す。
#[derive(Debug, thiserror::Error)]
pub(crate) enum ClearChildrenError {
    #[error("content rejected for {}: {reason}", .path.display())]
    ContentRejected { path: PathBuf, reason: String },
    #[error("task document render failed for {}: {reason}", .path.display())]
    DocumentRender { path: PathBuf, reason: String },
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
                // TaskFilePath と同じ forward-slash 正規化（Windows の backslash を統一）
                let rel_str = rel_path.to_string_lossy().replace('\\', "/");
                let full_str = full_path.to_string_lossy().replace('\\', "/");
                PreviewTaskFilenamePayload::Path {
                    file_name: file_name.into_string(),
                    rel_path: rel_str,
                    full_path: full_str,
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

/// 変更対象を除いたタスク集合が before / after で異なるかを判定する。
///
/// 件数の増減も差分として扱う（削除で参照元だけが残るケースを取りこぼさない）。
/// 比較キーは `normalize_task_path_for_lookup` で、slot 引き当てと同じ基準にする。
fn other_tasks_differ(before: &[Task], after: &[Task], target: &str) -> bool {
    let before_map = index_excluding_target(before, target);
    let after_map = index_excluding_target(after, target);
    if before_map.len() != after_map.len() {
        return true;
    }
    before_map
        .iter()
        .any(|(key, task)| after_map.get(key) != Some(task))
}

/// 変更対象を除いた task を正規化 path で引ける map にする。
fn index_excluding_target<'a>(tasks: &'a [Task], target: &str) -> HashMap<String, &'a Task> {
    tasks
        .iter()
        .map(|task| {
            (
                normalize_task_path_for_lookup(task.file_path.as_str()),
                task,
            )
        })
        .filter(|(key, _)| key != target)
        .collect()
}

/// task が完了カラムに居るか。`done_column` 未解決時は常に false。
fn is_in_done_column(task: &Task, done_column: Option<&ColumnName>) -> bool {
    done_column.is_some_and(|column| &task.status == column)
}

/// `actual` が移動元カラムとして期待した status と一致することを確かめる。
fn ensure_status_matches(intent: &MoveTaskIntent, actual: &str) -> Result<(), MoveTaskError> {
    if actual == intent.from_column {
        return Ok(());
    }
    Err(MoveTaskError::StatusMismatch {
        expected: intent.from_column.clone(),
        actual: actual.to_string(),
    })
}

fn build_patched_task(existing: &Task, intent: &UpdateTaskIntent) -> ParsedTask {
    let mut task = existing.to_parsed_task();
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
        let parent = if parent.is_empty() {
            None
        } else {
            Some(TaskFilePath::from_lenient(parent.clone()))
        };
        task.parent = parent;
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

/// augmented hierarchy 検証用に最低限のフィールドだけ埋めた candidate を作る。
fn build_provisional_task(
    rel_path: &Path,
    intent: &CreateTaskIntent,
    resolved_parent_path: Option<&str>,
    normalized_links: &[String],
) -> ParsedTask {
    let file_path = TaskFilePath::from_lenient(rel_path.to_string_lossy().replace('\\', "/"));
    let parent = resolved_parent_path.map(TaskFilePath::from_lenient);
    let links = normalized_links
        .iter()
        .map(|link| TaskFilePath::from_lenient(link.clone()))
        .collect();
    ParsedTask {
        id: file_path.clone(),
        file_path,
        title: intent.title.clone(),
        status: intent.status.clone(),
        priority: None,
        milestone: None,
        draft: intent.draft,
        labels: Vec::new(),
        due: None,
        links,
        body: String::new(),
        extras: BTreeMap::new(),
        parse_warnings: Vec::new(),
        parent,
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
    for task in &mut tasks {
        task.reset_graph_for_resolver();
    }
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
    let Some(parent) = task.parent() else {
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
    let already_exists = task.derived.graph_warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    });
    if already_exists {
        return;
    }

    task.derived.graph_warnings.push(TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".to_string()),
        message: "parent task was not found".to_string(),
    });
}

#[cfg(test)]
#[path = "task_index_tests.rs"]
mod task_index_tests;

#[cfg(test)]
#[path = "task_index_parent_chain_tests.rs"]
mod task_index_parent_chain_tests;

#[cfg(test)]
#[path = "task_index_external_change_tests.rs"]
mod task_index_external_change_tests;

#[cfg(test)]
#[path = "task_index_forest_tests.rs"]
mod task_index_forest_tests;

#[cfg(test)]
#[path = "task_index_label_usage_tests.rs"]
mod task_index_label_usage_tests;

#[cfg(test)]
#[path = "task_index_milestone_usage_tests.rs"]
mod task_index_milestone_usage_tests;

#[cfg(test)]
#[path = "task_index_milestone_projection_tests.rs"]
mod task_index_milestone_projection_tests;

#[cfg(test)]
#[path = "task_index_plan_create_tests.rs"]
mod task_index_plan_create_tests;

#[cfg(test)]
#[path = "task_index_plan_update_tests.rs"]
mod task_index_plan_update_tests;

#[cfg(test)]
#[path = "task_index_plan_move_tests.rs"]
mod task_index_plan_move_tests;

#[cfg(test)]
#[path = "task_index_clear_children_tests.rs"]
mod task_index_clear_children_tests;

#[cfg(test)]
#[path = "task_index_plan_delete_abort_tests.rs"]
mod task_index_plan_delete_abort_tests;

#[cfg(test)]
#[path = "task_index_plan_add_link_tests.rs"]
mod task_index_plan_add_link_tests;

#[cfg(test)]
#[path = "task_index_plan_remove_link_tests.rs"]
mod task_index_plan_remove_link_tests;

#[cfg(test)]
#[path = "task_index_plan_preview_filename_tests.rs"]
mod task_index_plan_preview_filename_tests;

/// `task` の (カラム表示順, カラム内 cardOrder 位置) を返す。
///
/// `cardOrder` に載っていない場合の位置は `usize::MAX` とし、同カラムの記載済み
/// タスクより後ろに回す（同順内の tie-break は呼び出し側が `id` で行う）。
fn card_sort_key(
    task: &Task,
    config: &Config,
    column_rank: &HashMap<&str, usize>,
    unknown_column_rank: usize,
) -> (usize, usize) {
    let status = task.status.as_str();
    let rank = column_rank
        .get(status)
        .copied()
        .unwrap_or(unknown_column_rank);
    let position = card_position_in_column(config, status, task.file_path.as_str());
    (rank, position)
}

/// `file_path` の、指定カラムの cardOrder における位置を返す。
///
/// cardOrder に載っていない（またはカラムのエントリ自体が無い）場合は `usize::MAX`
/// とし、記載済みタスクより後ろに回す（同順位の tie-break は呼び出し側が `id` で行う）。
/// `card_sort_key` と `TaskIndex::board_order_of_column` の双方がこの規則を共有する。
fn card_position_in_column(config: &Config, column: &str, file_path: &str) -> usize {
    config
        .card_order
        .get(column)
        .and_then(|paths| paths.iter().position(|p| p.as_str() == file_path))
        .unwrap_or(usize::MAX)
}
