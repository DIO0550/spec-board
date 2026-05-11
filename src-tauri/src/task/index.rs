use super::frontmatter::{parse_bytes, FrontmatterError, Parsed, Priority};
use crate::config::column_name::ColumnName;
use crate::config::Config;
use crate::task::label::Label;
use crate::task::path_normalization::{has_windows_drive_prefix, normalize_path_parts};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_title::TaskTitle;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fmt;
use std::path::{Path, PathBuf};
use thiserror::Error;

pub type TaskExtras = BTreeMap<String, serde_json::Value>;
const MAX_PARENT_DEPTH: usize = 20;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskWarningCode {
    MissingTitleUsedFileName,
    InvalidTitleUsedFileName,
    MissingStatusUsedDefault,
    InvalidStatusUsedDefault,
    InvalidParentIgnored,
    ParentNotFound,
    NonStringExtraKeyIgnored,
    ExtraValueNotJsonCompatible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWarning {
    pub code: TaskWarningCode,
    pub field: Option<String>,
    pub message: String,
}

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
    pub extras: TaskExtras,
    pub warnings: Vec<TaskWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskParseContext {
    pub file_path: PathBuf,
    pub default_status: ColumnName,
}

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

#[derive(Debug, Error)]
pub enum TaskParseError {
    #[error("frontmatter was not found")]
    NotTask,
    #[error("parent chain for '{file_path}' {reason}")]
    CycleOrTooDeep {
        file_path: String,
        reason: ParentHierarchyErrorReason,
    },
    #[error(transparent)]
    Frontmatter(#[from] FrontmatterError),
}

/// Markdown bytes and parse contextから Task を生成する。
///
/// @param input UTF-8 Markdown bytes。
/// @param context file path と status fallback を持つ変換 context。
/// @returns 生成された Task。frontmatter が無い場合は `TaskParseError::NotTask`。
pub fn task_from_markdown(
    input: &[u8],
    context: &TaskParseContext,
) -> Result<Task, TaskParseError> {
    let Some(parsed) = parse_bytes(input)? else {
        return Err(TaskParseError::NotTask);
    };
    Ok(task_from_parsed(parsed, context))
}

/// Parsed frontmatter と parse context から Task を生成する。
///
/// @param parsed `frontmatter::parse_bytes` 由来の Parsed。
/// @param context file path と status fallback を持つ変換 context。
/// @returns fallback と warning を反映した Task。
pub fn task_from_parsed(parsed: Parsed, context: &TaskParseContext) -> Task {
    let mut warnings = Vec::new();
    let title = extract_title(&parsed, context, &mut warnings);
    let status = extract_status(&parsed, context, &mut warnings);
    let parent = extract_parent(&parsed, &mut warnings);
    let extras = convert_extras(&parsed, &mut warnings);
    let file_path = normalized_task_file_path(&context.file_path);
    let labels = parsed
        .frontmatter
        .labels
        .into_iter()
        .map(Label::from_lenient)
        .collect();
    let links = parsed
        .frontmatter
        .links
        .into_iter()
        .map(TaskFilePath::from_lenient)
        .collect();

    Task {
        id: file_path.clone(),
        file_path,
        title,
        status,
        priority: parsed.frontmatter.priority,
        labels,
        parent,
        links,
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: parsed.body,
        extras,
        warnings,
    }
}

/// 全 Task の file_path に対して parent 参照の存在を検証する。
///
/// @param tasks 検証対象の Task 一覧。
/// @returns 存在しない parent を warning として追加した Task 一覧。
pub fn validate_parent_existence(mut tasks: Vec<Task>) -> Vec<Task> {
    let task_paths = task_path_index(&tasks);

    for task in &mut tasks {
        append_parent_not_found_warning(task, &task_paths);
    }

    tasks
}

/// 全 Task の parent 参照に対して存在検証と循環 / 深さ検証を行う。
///
/// @param tasks 検証対象の Task 一覧。正規化後の `file_path` が一意であることを前提にする。
/// @returns 存在しない parent の warning を保持し、循環または深さ超過がなければ Task 一覧を返す。
/// @throws TaskParseError::CycleOrTooDeep 起点 task の parent chain に循環がある、または parent 参照（edge）を21回以上辿る場合。
///
/// この API は parent 検証のみを行う。children の派生値構築には `build_children` を使う。
pub fn validate_parent_hierarchy(tasks: Vec<Task>) -> Result<Vec<Task>, TaskParseError> {
    let tasks = validate_parent_existence(tasks);
    let parent_lookup = parent_lookup_index(&tasks);

    for task in &tasks {
        validate_parent_chain(task, &parent_lookup)?;
    }

    Ok(tasks)
}

/// 全 Task の parent 参照を検証し、親 Task の children を parent 逆引きで構築する。
///
/// @param tasks 構築対象の Task 一覧。正規化後の `file_path` が一意であることを前提にする。
/// @returns parent warning と children 派生値を反映した Task 一覧。
/// @throws TaskParseError::CycleOrTooDeep parent chain に循環または深さ超過がある場合。
pub fn build_children(tasks: Vec<Task>) -> Result<Vec<Task>, TaskParseError> {
    let mut tasks = validate_parent_hierarchy(tasks)?;
    clear_children(&mut tasks);
    let parent_index = task_lookup_index(&tasks);

    for child_index in 0..tasks.len() {
        append_child_to_parent(child_index, &mut tasks, &parent_index);
    }

    Ok(tasks)
}

/// 全 Task の links を逆引きし、リンク先 Task の reverse_links を構築する。
///
/// source Task の入力順、その中の `links` 配列順で追加する。同一 source 内で複数 link が同じ
/// 正規化後 target を指す場合は、最初の link だけを採用する。存在しない target、空文字、
/// 絶対パス、Windows drive prefix は warning を追加せず skip する。
///
/// @param tasks 構築対象の Task 一覧。正規化後の `file_path` が一意であることを前提にする。
/// @returns reverse_links 派生値を反映した Task 一覧。
pub fn build_reverse_links(mut tasks: Vec<Task>) -> Vec<Task> {
    clear_reverse_links(&mut tasks);
    let task_index = task_lookup_index(&tasks);

    for source_index in 0..tasks.len() {
        append_reverse_links_from_source(source_index, &mut tasks, &task_index);
    }

    tasks
}

/// Task 一覧から正規化済み `file_path` の集合を構築する。
///
/// parent 存在検証では入力の表記揺れを吸収するため、この集合に対して照合する。
///
/// @param tasks index 化する Task 一覧。
/// @returns 正規化済み `file_path` の集合。
fn task_path_index(tasks: &[Task]) -> HashSet<String> {
    tasks
        .iter()
        .map(|task| normalize_task_path_for_lookup(task.file_path.as_str()))
        .collect()
}

/// Task の正規化済み `file_path` から正規化済み parent 参照への lookup を構築する。
///
/// 無効な parent 参照は `None` として保持し、循環検証では辿らない。
///
/// @param tasks lookup 化する Task 一覧。
/// @returns 正規化済み task path を key、正規化済み parent path を value にした map。
fn parent_lookup_index(tasks: &[Task]) -> HashMap<String, Option<String>> {
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

/// Task の正規化済み `file_path` から入力配列内 index への lookup を構築する。
///
/// @param tasks lookup 化する Task 一覧。
/// @returns 正規化済み task path を key、入力配列内 index を value にした map。
fn task_lookup_index(tasks: &[Task]) -> HashMap<String, usize> {
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

/// children 派生値を再計算前に全 Task から削除する。
///
/// @param tasks children を空にする Task 一覧。
/// @returns 戻り値なし。`tasks` を in-place で更新する。
fn clear_children(tasks: &mut [Task]) {
    for task in tasks {
        task.children.clear();
    }
}

/// reverse_links 派生値を再計算前に全 Task から削除する。
///
/// @param tasks reverse_links を空にする Task 一覧。
/// @returns 戻り値なし。`tasks` を in-place で更新する。
fn clear_reverse_links(tasks: &mut [Task]) {
    for task in tasks {
        task.reverse_links.clear();
    }
}

/// child の parent 参照が既存 Task に解決できる場合、親 Task の children に child path を追加する。
///
/// @param child_index child として処理する Task の入力配列内 index。
/// @param tasks children を更新する Task 一覧。
/// @param parent_index 正規化済み task path から入力配列内 index への lookup。
/// @returns 戻り値なし。parent が解決できた場合のみ `tasks` を in-place で更新する。
fn append_child_to_parent(
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

/// source Task の links を解決し、各 target Task の reverse_links に source path を追加する。
///
/// @param source_index source として処理する Task の入力配列内 index。
/// @param tasks reverse_links を更新する Task 一覧。
/// @param task_index 正規化済み task path から入力配列内 index への lookup。
/// @returns 戻り値なし。link target が解決できた Task だけを in-place で更新する。
fn append_reverse_links_from_source(
    source_index: usize,
    tasks: &mut [Task],
    task_index: &HashMap<String, usize>,
) {
    let source_file_path = tasks[source_index].file_path.clone();
    let target_indices = reverse_link_target_indices(&tasks[source_index].links, task_index);

    for target_index in target_indices {
        tasks[target_index]
            .reverse_links
            .push(source_file_path.clone());
    }
}

/// link 文字列群を正規化し、存在する target Task の index 一覧に変換する。
///
/// 同一 source 内で同じ正規化 target を複数回参照する場合は、最初の参照だけを採用する。
///
/// @param links source Task が保持する link 参照文字列の一覧。
/// @param task_index 正規化済み task path から入力配列内 index への lookup。
/// @returns 存在する link target の入力配列内 index 一覧。
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

/// 指定 Task を起点に parent chain を辿り、循環と最大深さ超過を検出する。
///
/// @param task parent chain の検証起点 Task。
/// @param parent_lookup 正規化済み task path から正規化済み parent path への lookup。
/// @returns 循環と最大深さ超過がなければ `Ok(())`、検出した場合は `TaskParseError`。
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

/// 新規タスクが受け取る parent 文字列を正規化し、既存タスク群の中から index を解決する。
///
/// 空文字 / 絶対パス / Windows drive prefix / 不一致パス のいずれかは `None` を返す。
/// 自己参照（新規タスク自身の想定 file_path を parent に渡すケース）も既存タスク集合に
/// 未登録のため、自然に `None` となる。
///
/// @param parent 新規タスクの parent 引数文字列（プロジェクトルート相対 / `.md` 込み）。
/// @param tasks 既存タスクスナップショット。
/// @returns 一致する Task の入力配列内 index。一致しない場合は `None`。
pub(crate) fn resolve_parent_for_new_task(parent: &str, tasks: &[Task]) -> Option<usize> {
    let normalized = normalize_parent_path_for_lookup(parent)?;
    tasks
        .iter()
        .position(|task| normalize_task_path_for_lookup(task.file_path.as_str()) == normalized)
}

/// parent 起点に新規タスクを末端へ 1 edge 追加した chain の循環/深さ超過を検出する。
///
/// `depth` は「新規タスクから上に向かって辿った edge 累計」を表す。初期 `depth = 1` は
/// 新規タスク → 起点 parent の 1 edge ぶんで、parent の上方向に 1 つ進めるたびに `depth += 1` する。
/// 判定は親辺取得の **前** に `depth > MAX_PARENT_DEPTH` を確認するため、
/// parent 側 chain の edge 数 19 → `Ok(())`（合計 20 = `MAX_PARENT_DEPTH`）、
/// 20 → `TooDeep`（合計 21 で上限超過）となる。
///
/// 事前条件: `parent_index < tasks.len()`。`resolve_parent_for_new_task` が `Some(idx)` を返した
/// 直後にのみ呼ぶこと。範囲外の場合は caller の不変条件違反として panic する。
///
/// @param parent_index 起点 parent の `tasks` 内 index。
/// @param tasks 既存タスクスナップショット。
/// @returns Ok(()) / `ParentHierarchyErrorReason::Cycle` / `ParentHierarchyErrorReason::TooDeep`。
pub(crate) fn validate_chain_from_parent(
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

/// parent 参照が解決できない Task に `ParentNotFound` warning を追加する。
///
/// @param task parent 存在検証の対象 Task。
/// @param task_paths 存在する正規化済み task path の集合。
/// @returns 戻り値なし。parent が解決できない場合のみ `task.warnings` を更新する。
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

/// Task に `ParentNotFound` warning が未登録の場合だけ追加する。
///
/// @param task warning を追加する Task。
/// @returns 戻り値なし。既存 warning がない場合のみ `task.warnings` を更新する。
fn push_parent_not_found(task: &mut Task) {
    let already_exists = task.warnings.iter().any(|warning| {
        warning.code == TaskWarningCode::ParentNotFound
            && warning.field.as_deref() == Some("parent")
    });
    if already_exists {
        return;
    }

    task.warnings.push(warning(
        TaskWarningCode::ParentNotFound,
        Some("parent"),
        "parent task was not found",
    ));
}

/// Parsed frontmatter から title を取り出し、不在または不正な場合は file name fallback を返す。
///
/// @param parsed title を取り出す Parsed frontmatter。
/// @param context file name fallback の生成に使う parse context。
/// @param warnings title 不在または不正時の warning 追加先。
/// @returns frontmatter の title、または file name 由来の fallback title。
fn extract_title(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> TaskTitle {
    match extract_string_extra(&parsed.frontmatter.extras, "title") {
        Ok(Some(title)) if !title.is_empty() => TaskTitle::from_lenient(title),
        Ok(Some(_)) | Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidTitleUsedFileName,
                Some("title"),
                "title is invalid; file name was used",
            ));
            title_fallback_from_file_path(&context.file_path)
        }
        Ok(None) => {
            warnings.push(warning(
                TaskWarningCode::MissingTitleUsedFileName,
                Some("title"),
                "title is missing; file name was used",
            ));
            title_fallback_from_file_path(&context.file_path)
        }
    }
}

/// Parsed frontmatter から status を取り出し、不在または不正な場合は default status を返す。
///
/// @param parsed status を取り出す Parsed frontmatter。
/// @param context default status を保持する parse context。
/// @param warnings status 不在または不正時の warning 追加先。
/// @returns frontmatter の status、または context の default status。
fn extract_status(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> ColumnName {
    match extract_string_extra(&parsed.frontmatter.extras, "status") {
        Ok(Some(status)) => ColumnName::from_lenient(status),
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidStatusUsedDefault,
                Some("status"),
                "status is invalid; default status was used",
            ));
            context.default_status.clone()
        }
        Ok(None) => {
            warnings.push(warning(
                TaskWarningCode::MissingStatusUsedDefault,
                Some("status"),
                "status is missing; default status was used",
            ));
            context.default_status.clone()
        }
    }
}

/// Parsed frontmatter から parent を文字列として取り出し、不正な型の場合は warning を追加する。
///
/// @param parsed parent を取り出す Parsed frontmatter。
/// @param warnings parent 不正時の warning 追加先。
/// @returns parent 文字列。不在または不正な型の場合は `None`。
fn extract_parent(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> Option<TaskFilePath> {
    match extract_string_extra(&parsed.frontmatter.extras, "parent") {
        Ok(parent) => parent.map(TaskFilePath::from_lenient),
        Err(()) => {
            warnings.push(warning(
                TaskWarningCode::InvalidParentIgnored,
                Some("parent"),
                "parent is invalid; value was ignored",
            ));
            None
        }
    }
}

/// typed field 以外の frontmatter entry を JSON 互換の extras に変換する。
///
/// @param parsed extras 変換元の Parsed frontmatter。
/// @param warnings non-string key または JSON 非互換 value の warning 追加先。
/// @returns JSON 互換 value だけを保持する Task extras。
fn convert_extras(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> TaskExtras {
    const TYPED_KEYS: [&str; 6] = ["title", "status", "priority", "labels", "parent", "links"];
    let mut extras = BTreeMap::new();

    for (key, value) in &parsed.frontmatter.extras {
        let serde_yaml_ng::Value::String(key) = key else {
            warnings.push(warning(
                TaskWarningCode::NonStringExtraKeyIgnored,
                None,
                "non-string extra key was ignored",
            ));
            continue;
        };

        if TYPED_KEYS.contains(&key.as_str()) {
            continue;
        }

        let Some(json_value) = yaml_value_to_json(value) else {
            warnings.push(warning(
                TaskWarningCode::ExtraValueNotJsonCompatible,
                Some(key),
                "extra value is not JSON compatible; value was ignored",
            ));
            continue;
        };

        extras.insert(key.clone(), json_value);
    }

    extras
}

/// warning code、field、message から `TaskWarning` を構築する。
///
/// @param code warning の分類コード。
/// @param field warning 対象の frontmatter field 名。
/// @param message warning の説明文。
/// @returns 指定値を保持する `TaskWarning`。
fn warning(code: TaskWarningCode, field: Option<&str>, message: &str) -> TaskWarning {
    TaskWarning {
        code,
        field: field.map(str::to_string),
        message: message.to_string(),
    }
}

/// extras mapping から指定 key の文字列値を取り出す。
///
/// @param extras 検索対象の YAML mapping。
/// @param key 取り出す field 名。
/// @returns key が無ければ `Ok(None)`、文字列値なら `Ok(Some(value))`、非文字列なら `Err(())`。
fn extract_string_extra(extras: &serde_yaml_ng::Mapping, key: &str) -> Result<Option<String>, ()> {
    let Some(value) = extras.get(key) else {
        return Ok(None);
    };
    let serde_yaml_ng::Value::String(s) = value else {
        return Err(());
    };
    Ok(Some(s.clone()))
}

/// file path の stem から title fallback を生成する。
///
/// @param path title fallback の元にする file path。
/// @returns file stem の `-` を空白に置換した title。stem が空または取得不能なら `"Untitled"`。
fn title_fallback_from_file_path(path: &Path) -> TaskTitle {
    let Some(stem) = path.file_stem() else {
        return TaskTitle::from_lenient("Untitled");
    };
    let title = stem.to_string_lossy().replace('-', " ");
    if title.is_empty() {
        return TaskTitle::from_lenient("Untitled");
    }
    TaskTitle::from_lenient(title)
}

/// Task payload 用の file path を forward slash 区切りの正規化済み VO に変換する。
///
/// scanner / `task_from_parsed` の自身 path 生成用。strict 構築を first 試行し、
/// 病的入力の場合は lenient 構築にフォールバックする（`Task` 自体は構築する
/// 既存の非失敗シグネチャを維持）。
pub(crate) fn normalized_task_file_path(path: &Path) -> TaskFilePath {
    match TaskFilePath::from_relative_path(path) {
        Ok(vo) => vo,
        Err(_) => {
            let raw = path.to_string_lossy().replace('\\', "/");
            let normalized = normalize_path_parts(&raw, true);
            TaskFilePath::from_lenient(normalized)
        }
    }
}

/// `Config::columns` の `order` 昇順先頭の `name` を default status として返す。
///
/// `columns` が空の場合は空文字列の `ColumnName`（lenient 構築）を返す。
/// `task_from_markdown` 側でも空文字 fallback を許容するため、空 columns でも
/// parse は成立する。
pub(crate) fn default_status_for(config: &Config) -> ColumnName {
    config
        .columns
        .iter()
        .min_by_key(|column| column.order)
        .map(|column| column.name.clone())
        .unwrap_or_else(|| ColumnName::from_lenient(""))
}

/// Task の file path を lookup 用に正規化する。
///
/// @param path lookup key に変換する Task file path。
/// @returns lookup 用の正規化済み path。
fn normalize_task_path_for_lookup(path: &str) -> String {
    let path_text = path.replace('\\', "/");
    normalize_path_parts(&path_text, true)
}

/// parent 参照文字列を lookup 用の相対パスへ正規化する。
///
/// 空文字、絶対パス、Windows drive prefix は task graph の対象外として `None` を返す。
///
/// @param parent 正規化する parent 参照文字列。
/// @returns lookup 用の正規化済み相対 path。task graph 対象外の場合は `None`。
fn normalize_parent_path_for_lookup(parent: &str) -> Option<String> {
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

/// link 参照文字列を lookup 用の相対パスへ正規化する。
///
/// @param link 正規化する link 参照文字列。
/// @returns lookup 用の正規化済み相対 path。task graph 対象外の場合は `None`。
fn normalize_link_path_for_lookup(link: &str) -> Option<String> {
    normalize_parent_path_for_lookup(link)
}

/// Task 集合の整合性（parent 存在 / 循環検出 / children・reverse_links 派生）を
/// 守る Aggregate。既存純粋関数（`build_children` / `validate_parent_hierarchy` /
/// `resolve_parent_for_new_task` / `validate_chain_from_parent`）への薄い委譲層
/// として機能する。
///
/// 本 Aggregate を経由して Task 集合を操作することで、不変条件（「children は
/// parent 逆引きで派生する」「parent chain は循環せず深さ MAX_PARENT_DEPTH 以下」）
/// が型レベルで明示される。
#[derive(Debug, Clone, PartialEq)]
pub struct TaskIndex {
    tasks: Vec<Task>,
}

impl TaskIndex {
    /// 既存の `Vec<Task>` から Aggregate を構築する。
    pub fn new(tasks: Vec<Task>) -> Self {
        Self { tasks }
    }

    /// 内部の `Vec<Task>` を取り出す。
    pub fn into_tasks(self) -> Vec<Task> {
        self.tasks
    }

    /// 内部の Task slice を借用する。
    pub fn as_slice(&self) -> &[Task] {
        &self.tasks
    }

    /// parent 存在のみを検証して warning を追加する（純粋関数 `validate_parent_existence`
    /// への委譲）。
    pub fn validate_parent_existence(self) -> Self {
        Self {
            tasks: validate_parent_existence(self.tasks),
        }
    }

    /// parent 存在 + 循環 + 深さ検証を行う（`validate_parent_hierarchy` への委譲）。
    pub fn validate_parent_hierarchy(self) -> Result<Self, TaskParseError> {
        Ok(Self {
            tasks: validate_parent_hierarchy(self.tasks)?,
        })
    }

    /// parent 検証 + children 派生値構築（`build_children` への委譲）。
    pub fn build_children(self) -> Result<Self, TaskParseError> {
        Ok(Self {
            tasks: build_children(self.tasks)?,
        })
    }

    /// 全 Task の links 逆引きで reverse_links 派生値を構築する
    /// （`build_reverse_links` への委譲）。
    pub fn build_reverse_links(self) -> Self {
        Self {
            tasks: build_reverse_links(self.tasks),
        }
    }

    /// 新規タスク用 parent 文字列から既存タスク集合内 index を解決する
    /// （`resolve_parent_for_new_task` への委譲）。
    pub fn resolve_parent_for_new_task(&self, parent: &str) -> Option<usize> {
        resolve_parent_for_new_task(parent, &self.tasks)
    }

    /// 起点 parent から末端へ 1 edge 追加した chain の循環/深さ超過を検出する
    /// （`validate_chain_from_parent` への委譲）。
    pub fn validate_chain_from_parent(
        &self,
        parent_index: usize,
    ) -> Result<(), ParentHierarchyErrorReason> {
        validate_chain_from_parent(parent_index, &self.tasks)
    }
}

impl From<Vec<Task>> for TaskIndex {
    fn from(tasks: Vec<Task>) -> Self {
        Self::new(tasks)
    }
}

/// YAML value を JSON value に変換し、JSON 互換でない tagged value は除外する。
///
/// @param value 変換対象の YAML value。
/// @returns JSON value に変換できた場合は `Some`、tagged value または変換失敗時は `None`。
fn yaml_value_to_json(value: &serde_yaml_ng::Value) -> Option<serde_json::Value> {
    if matches!(value, serde_yaml_ng::Value::Tagged(_)) {
        return None;
    }
    serde_json::to_value(value).ok()
}

#[cfg(test)]
#[path = "index_tests.rs"]
mod index_tests;
