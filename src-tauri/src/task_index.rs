use crate::frontmatter::{parse_bytes, FrontmatterError, Parsed, Priority};
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
    pub id: String,
    pub file_path: String,
    pub title: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<Priority>,
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub links: Vec<String>,
    pub children: Vec<String>,
    pub reverse_links: Vec<String>,
    pub body: String,
    pub extras: TaskExtras,
    pub warnings: Vec<TaskWarning>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskParseContext {
    pub file_path: PathBuf,
    pub default_status: String,
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

    Task {
        id: file_path.clone(),
        file_path,
        title,
        status,
        priority: parsed.frontmatter.priority,
        labels: parsed.frontmatter.labels,
        parent,
        links: parsed.frontmatter.links,
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

fn task_path_index(tasks: &[Task]) -> HashSet<String> {
    tasks
        .iter()
        .map(|task| normalize_task_path_for_lookup(&task.file_path))
        .collect()
}

fn parent_lookup_index(tasks: &[Task]) -> HashMap<String, Option<String>> {
    tasks
        .iter()
        .map(|task| {
            (
                normalize_task_path_for_lookup(&task.file_path),
                task.parent
                    .as_deref()
                    .and_then(normalize_parent_path_for_lookup),
            )
        })
        .collect()
}

fn task_lookup_index(tasks: &[Task]) -> HashMap<String, usize> {
    tasks
        .iter()
        .enumerate()
        .map(|(index, task)| (normalize_task_path_for_lookup(&task.file_path), index))
        .collect()
}

fn clear_children(tasks: &mut [Task]) {
    for task in tasks {
        task.children.clear();
    }
}

fn clear_reverse_links(tasks: &mut [Task]) {
    for task in tasks {
        task.reverse_links.clear();
    }
}

fn append_child_to_parent(
    child_index: usize,
    tasks: &mut [Task],
    parent_index: &HashMap<String, usize>,
) {
    let child_file_path = tasks[child_index].file_path.clone();
    let Some(parent_path) = tasks[child_index]
        .parent
        .as_deref()
        .and_then(normalize_parent_path_for_lookup)
    else {
        return;
    };

    let Some(parent_task_index) = parent_index.get(&parent_path).copied() else {
        return;
    };

    let children = &mut tasks[parent_task_index].children;
    children.push(child_file_path);
}

fn append_reverse_links_from_source(
    source_index: usize,
    tasks: &mut [Task],
    task_index: &HashMap<String, usize>,
) {
    let source_file_path = tasks[source_index].file_path.clone();
    let links = tasks[source_index].links.clone();
    let mut seen_targets = HashSet::new();

    for link in links {
        append_reverse_link_to_target(
            &source_file_path,
            &link,
            tasks,
            task_index,
            &mut seen_targets,
        );
    }
}

fn append_reverse_link_to_target(
    source_file_path: &str,
    link: &str,
    tasks: &mut [Task],
    task_index: &HashMap<String, usize>,
    seen_targets: &mut HashSet<String>,
) {
    let Some(target_path) = normalize_link_path_for_lookup(link) else {
        return;
    };
    if !seen_targets.insert(target_path.clone()) {
        return;
    }

    let Some(target_task_index) = task_index.get(&target_path).copied() else {
        return;
    };

    tasks[target_task_index]
        .reverse_links
        .push(source_file_path.to_string());
}

fn validate_parent_chain(
    task: &Task,
    parent_lookup: &HashMap<String, Option<String>>,
) -> Result<(), TaskParseError> {
    let mut visited = HashSet::new();
    let origin = task.file_path.clone();
    let mut current = normalize_task_path_for_lookup(&task.file_path);
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

    let Some(parent_lookup_path) = normalize_parent_path_for_lookup(parent) else {
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

    task.warnings.push(warning(
        TaskWarningCode::ParentNotFound,
        Some("parent"),
        "parent task was not found",
    ));
}

fn extract_title(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> String {
    match extract_string_extra(&parsed.frontmatter.extras, "title") {
        Ok(Some(title)) if !title.is_empty() => title,
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

fn extract_status(
    parsed: &Parsed,
    context: &TaskParseContext,
    warnings: &mut Vec<TaskWarning>,
) -> String {
    match extract_string_extra(&parsed.frontmatter.extras, "status") {
        Ok(Some(status)) => status,
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

fn extract_parent(parsed: &Parsed, warnings: &mut Vec<TaskWarning>) -> Option<String> {
    match extract_string_extra(&parsed.frontmatter.extras, "parent") {
        Ok(parent) => parent,
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

fn warning(code: TaskWarningCode, field: Option<&str>, message: &str) -> TaskWarning {
    TaskWarning {
        code,
        field: field.map(str::to_string),
        message: message.to_string(),
    }
}

fn extract_string_extra(extras: &serde_yaml_ng::Mapping, key: &str) -> Result<Option<String>, ()> {
    let Some(value) = extras.get(key) else {
        return Ok(None);
    };
    let serde_yaml_ng::Value::String(s) = value else {
        return Err(());
    };
    Ok(Some(s.clone()))
}

fn title_fallback_from_file_path(path: &Path) -> String {
    let Some(stem) = path.file_stem() else {
        return "Untitled".to_string();
    };
    let title = stem.to_string_lossy().replace('-', " ");
    if title.is_empty() {
        return "Untitled".to_string();
    }
    title
}

fn normalized_task_file_path(path: &Path) -> String {
    let path_text = path.to_string_lossy().replace('\\', "/");
    normalize_path_parts(&path_text, true)
}

fn normalize_task_path_for_lookup(path: &str) -> String {
    let path_text = path.replace('\\', "/");
    normalize_path_parts(&path_text, true)
}

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

fn normalize_link_path_for_lookup(link: &str) -> Option<String> {
    normalize_parent_path_for_lookup(link)
}

fn normalize_path_parts(path_text: &str, remove_drive_prefix: bool) -> String {
    let mut parts = Vec::new();
    for part in path_text.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if remove_drive_prefix && part.ends_with(':') {
            continue;
        }
        parts.push(part);
    }
    parts.join("/")
}

fn has_windows_drive_prefix(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.len() < 2 {
        return false;
    }

    bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn yaml_value_to_json(value: &serde_yaml_ng::Value) -> Option<serde_json::Value> {
    if matches!(value, serde_yaml_ng::Value::Tagged(_)) {
        return None;
    }
    serde_json::to_value(value).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frontmatter::{Frontmatter, Priority};
    use serde_json::json;
    use std::collections::BTreeMap;

    fn context(path: &str) -> TaskParseContext {
        TaskParseContext {
            file_path: PathBuf::from(path),
            default_status: "Todo".to_string(),
        }
    }

    fn task_from(input: &str, path: &str) -> Task {
        task_from_markdown(input.as_bytes(), &context(path)).unwrap()
    }

    fn task_with_parent(path: &str, parent: &str) -> Task {
        task_from(
            &format!("---\ntitle: Task\nstatus: Todo\nparent: {parent}\n---\n"),
            path,
        )
    }

    fn task_without_parent(path: &str) -> Task {
        task_from("---\ntitle: Task\nstatus: Todo\n---\n", path)
    }

    fn task_with_links(path: &str, links: &[&str]) -> Task {
        let links_yaml = links
            .iter()
            .map(|link| format!("  - {link}"))
            .collect::<Vec<_>>()
            .join("\n");
        task_from(
            &format!("---\ntitle: Task\nstatus: Todo\nlinks:\n{links_yaml}\n---\n"),
            path,
        )
    }

    fn parent_chain_with_edge_count(edge_count: usize) -> Vec<Task> {
        let mut tasks = Vec::new();

        for index in 0..edge_count {
            tasks.push(task_with_parent(
                &format!("tasks/{index}.md"),
                &format!("tasks/{}.md", index + 1),
            ));
        }

        tasks.push(task_without_parent(&format!("tasks/{edge_count}.md")));
        tasks
    }

    fn parsed_with_extras(extras: serde_yaml_ng::Mapping) -> Parsed {
        Parsed {
            frontmatter: Frontmatter {
                extras,
                ..Frontmatter::default()
            },
            body: String::new(),
        }
    }

    #[test]
    fn minimum_frontmatter_generates_task() {
        let task = task_from(
            "---\ntitle: Fix bug\nstatus: Doing\n---\n",
            "tasks/fix-bug.md",
        );

        assert_eq!(task.id, "tasks/fix-bug.md");
        assert_eq!(task.file_path, "tasks/fix-bug.md");
        assert_eq!(task.title, "Fix bug");
        assert_eq!(task.status, "Doing");
        assert_eq!(task.priority, None);
        assert_eq!(task.labels, Vec::<String>::new());
        assert_eq!(task.parent, None);
        assert_eq!(task.links, Vec::<String>::new());
        assert_eq!(task.children, Vec::<String>::new());
        assert_eq!(task.reverse_links, Vec::<String>::new());
        assert_eq!(task.body, "");
        assert_eq!(task.extras, BTreeMap::new());
        assert_eq!(task.warnings, Vec::<TaskWarning>::new());
    }

    #[test]
    fn typed_parser_fields_and_body_are_reflected() {
        let task = task_from(
            "---\ntitle: Feature\nstatus: Doing\npriority: high\nlabels: [bug, bug, api]\nlinks: related.md\n---\nBody\n",
            "feature.md",
        );

        assert_eq!(task.priority, Some(Priority::High));
        assert_eq!(task.labels, vec!["bug".to_string(), "api".to_string()]);
        assert_eq!(task.links, vec!["related.md".to_string()]);
        assert_eq!(task.body, "Body\n");
    }

    #[test]
    fn missing_title_uses_file_name_fallback_with_warning() {
        let task = task_from("---\nstatus: Todo\n---\n", "tasks/fix-login.md");

        assert_eq!(task.title, "fix login");
        assert_eq!(
            task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::MissingTitleUsedFileName,
                field: Some("title".to_string()),
                message: "title is missing; file name was used".to_string(),
            }]
        );
    }

    #[test]
    fn invalid_title_uses_file_name_fallback_with_warning() {
        let cases = [
            ("---\ntitle: ''\nstatus: Todo\n---\n", "空文字"),
            ("---\ntitle: 123\nstatus: Todo\n---\n", "非文字列"),
        ];

        for (input, label) in cases {
            let task = task_from(input, "tasks/fix-login.md");
            assert_eq!(task.title, "fix login", "{label}");
            assert_eq!(
                task.warnings,
                vec![TaskWarning {
                    code: TaskWarningCode::InvalidTitleUsedFileName,
                    field: Some("title".to_string()),
                    message: "title is invalid; file name was used".to_string(),
                }],
                "{label}"
            );
        }
    }

    #[test]
    fn missing_status_uses_default_with_warning() {
        let task = task_from("---\ntitle: Fix bug\n---\n", "tasks/fix-bug.md");

        assert_eq!(task.status, "Todo");
        assert_eq!(
            task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::MissingStatusUsedDefault,
                field: Some("status".to_string()),
                message: "status is missing; default status was used".to_string(),
            }]
        );
    }

    #[test]
    fn invalid_status_uses_default_with_warning() {
        let task = task_from(
            "---\ntitle: Fix bug\nstatus: [Doing]\n---\n",
            "tasks/fix-bug.md",
        );

        assert_eq!(task.status, "Todo");
        assert_eq!(
            task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::InvalidStatusUsedDefault,
                field: Some("status".to_string()),
                message: "status is invalid; default status was used".to_string(),
            }]
        );
    }

    #[test]
    fn parent_is_reflected_when_string_and_ignored_when_missing_or_invalid() {
        let parent_task = task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\n---\n",
            "tasks/child.md",
        );
        let missing_parent_task =
            task_from("---\ntitle: Root\nstatus: Todo\n---\n", "tasks/root.md");
        let invalid_parent_task = task_from(
            "---\ntitle: Root\nstatus: Todo\nparent: 123\n---\n",
            "tasks/root.md",
        );

        assert_eq!(parent_task.parent, Some("tasks/parent.md".to_string()));
        assert_eq!(missing_parent_task.parent, None);
        assert_eq!(invalid_parent_task.parent, None);
        assert_eq!(
            invalid_parent_task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::InvalidParentIgnored,
                field: Some("parent".to_string()),
                message: "parent is invalid; value was ignored".to_string(),
            }]
        );
    }

    #[test]
    fn parent_existence_validation_does_not_warn_when_parent_is_missing_or_existing() {
        let tasks = validate_parent_existence(vec![
            task_from("---\ntitle: Root\nstatus: Todo\n---\n", "tasks/root.md"),
            task_from("---\ntitle: Parent\nstatus: Todo\n---\n", "tasks/parent.md"),
            task_from(
                "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\n---\n",
                "tasks/child.md",
            ),
        ]);

        assert!(tasks[0].warnings.is_empty());
        assert!(tasks[2]
            .warnings
            .iter()
            .all(|warning| warning.code != TaskWarningCode::ParentNotFound));
    }

    #[test]
    fn missing_parent_adds_warning_without_dropping_task_or_parent_value() {
        let tasks = validate_parent_existence(vec![task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing.md\n---\n",
            "tasks/child.md",
        )]);

        assert_eq!(tasks[0].parent, Some("tasks/missing.md".to_string()));
        assert!(tasks[0].warnings.iter().any(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        }));
    }

    #[test]
    fn empty_parent_adds_warning_without_normalizing_parent_value() {
        let tasks = validate_parent_existence(vec![task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: ''\n---\n",
            "tasks/child.md",
        )]);

        assert_eq!(tasks[0].parent, Some(String::new()));
        assert!(tasks[0].warnings.iter().any(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        }));
    }

    #[test]
    fn parent_existence_validation_warns_each_task_and_keeps_existing_warnings() {
        let tasks = validate_parent_existence(vec![
            task_from(
                "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing-a.md\n---\n",
                "tasks/child-a.md",
            ),
            task_from(
                "---\ntitle: 123\nstatus: Todo\nparent: tasks/missing-b.md\n---\n",
                "tasks/child-b.md",
            ),
        ]);

        assert!(tasks[0].warnings.iter().any(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        }));
        assert!(tasks[1]
            .warnings
            .iter()
            .any(|warning| warning.code == TaskWarningCode::InvalidTitleUsedFileName));
        assert!(tasks[1].warnings.iter().any(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        }));
    }

    #[test]
    fn parent_existence_validation_does_not_duplicate_parent_not_found_warning() {
        let mut task = task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: tasks/missing.md\n---\n",
            "tasks/child.md",
        );
        task.warnings.push(TaskWarning {
            code: TaskWarningCode::ParentNotFound,
            field: Some("parent".to_string()),
            message: "parent task was not found".to_string(),
        });

        let tasks = validate_parent_existence(vec![task]);
        let warning_count = tasks[0]
            .warnings
            .iter()
            .filter(|warning| {
                warning.code == TaskWarningCode::ParentNotFound
                    && warning.field.as_deref() == Some("parent")
            })
            .count();

        assert_eq!(warning_count, 1);
    }

    #[test]
    fn self_parent_is_treated_as_existing_parent() {
        let tasks = validate_parent_existence(vec![task_from(
            "---\ntitle: Child\nstatus: Todo\nparent: tasks/child.md\n---\n",
            "tasks/child.md",
        )]);

        assert!(tasks[0]
            .warnings
            .iter()
            .all(|warning| warning.code != TaskWarningCode::ParentNotFound));
    }

    #[test]
    fn build_children_adds_child_file_path_to_parent() {
        let tasks = vec![
            task_without_parent("tasks/parent.md"),
            task_with_parent("tasks/child.md", "tasks/parent.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
    }

    #[test]
    fn build_children_adds_child_file_paths_to_parent_in_input_order() {
        let tasks = vec![
            task_without_parent("tasks/parent.md"),
            task_with_parent("tasks/child-a.md", "tasks/parent.md"),
            task_with_parent("tasks/child-b.md", "tasks/parent.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert_eq!(
            tasks[0].children,
            vec![
                "tasks/child-a.md".to_string(),
                "tasks/child-b.md".to_string(),
            ]
        );
    }

    #[test]
    fn build_children_adds_child_when_parent_appears_later() {
        let tasks = vec![
            task_with_parent("tasks/child.md", "tasks/parent.md"),
            task_without_parent("tasks/parent.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert_eq!(tasks[1].children, vec!["tasks/child.md".to_string()]);
    }

    #[test]
    fn build_children_clears_existing_children_before_recalculation() {
        let mut parent = task_without_parent("tasks/parent.md");
        parent.children = vec![
            "tasks/stale.md".to_string(),
            "tasks/child.md".to_string(),
            "tasks/child.md".to_string(),
        ];
        let tasks = vec![
            parent,
            task_with_parent("tasks/child.md", "tasks/parent.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
    }

    #[test]
    fn build_children_matches_parent_with_dot_prefix() {
        let tasks = vec![
            task_without_parent("tasks/parent.md"),
            task_with_parent("tasks/child.md", "./tasks/parent.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
    }

    #[test]
    fn build_children_matches_parent_with_backslash_separator() {
        let tasks = vec![
            task_without_parent("tasks/parent.md"),
            task_with_parent("tasks/child.md", "tasks\\parent.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert_eq!(tasks[0].children, vec!["tasks/child.md".to_string()]);
    }

    #[test]
    fn build_children_keeps_missing_parent_warning_without_child_append() {
        let tasks = vec![
            task_without_parent("tasks/parent.md"),
            task_with_parent("tasks/child.md", "tasks/missing.md"),
        ];

        let tasks = build_children(tasks).unwrap();

        assert!(tasks[0].children.is_empty());
        assert!(tasks[1].warnings.iter().any(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        }));
    }

    #[test]
    fn build_children_ignores_empty_absolute_and_drive_prefix_parent_for_child_append() {
        let cases = ["", "/tasks/parent.md", "C:\\tasks\\parent.md"];

        for parent in cases {
            let mut child = task_without_parent("tasks/child.md");
            child.parent = Some(parent.to_string());
            let tasks = vec![task_without_parent("tasks/parent.md"), child];

            let tasks = build_children(tasks).unwrap();

            assert!(tasks[0].children.is_empty(), "{parent}");
            assert!(
                tasks[1].warnings.iter().any(|warning| {
                    warning.code == TaskWarningCode::ParentNotFound
                        && warning.field.as_deref() == Some("parent")
                }),
                "{parent}"
            );
        }
    }

    #[test]
    fn build_children_returns_error_for_self_reference() {
        let result = build_children(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::Cycle,
            }) if file_path == "tasks/a.md"
        ));
    }

    #[test]
    fn build_children_returns_error_for_cycle() {
        let result = build_children(vec![
            task_with_parent("tasks/a.md", "tasks/b.md"),
            task_with_parent("tasks/b.md", "tasks/a.md"),
        ]);

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::Cycle,
            }) if file_path == "tasks/a.md"
        ));
    }

    #[test]
    fn build_children_returns_error_for_parent_chain_over_max_depth() {
        let result = build_children(parent_chain_with_edge_count(21));

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::TooDeep,
            }) if file_path == "tasks/0.md"
        ));
    }

    #[test]
    fn build_children_accepts_empty_tasks() {
        let tasks = build_children(Vec::new()).unwrap();

        assert!(tasks.is_empty());
    }

    #[test]
    fn build_reverse_links_adds_source_file_path_to_target() {
        let tasks = vec![
            task_with_links("tasks/source.md", &["tasks/target.md"]),
            task_without_parent("tasks/target.md"),
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn build_reverse_links_adds_sources_in_input_order() {
        let tasks = vec![
            task_with_links("tasks/source-a.md", &["tasks/target.md"]),
            task_with_links("tasks/source-b.md", &["tasks/target.md"]),
            task_without_parent("tasks/target.md"),
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(
            tasks[2].reverse_links,
            vec![
                "tasks/source-a.md".to_string(),
                "tasks/source-b.md".to_string(),
            ]
        );
    }

    #[test]
    fn build_reverse_links_processes_links_in_array_order() {
        let tasks = vec![
            task_with_links(
                "tasks/source.md",
                &["tasks/target-b.md", "tasks/target-a.md"],
            ),
            task_without_parent("tasks/target-a.md"),
            task_without_parent("tasks/target-b.md"),
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
        assert_eq!(tasks[2].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn build_reverse_links_deduplicates_normalized_targets_per_source() {
        let tasks = vec![
            task_with_links(
                "tasks/source.md",
                &["tasks/target.md", "./tasks/target.md", "tasks\\target.md"],
            ),
            task_without_parent("tasks/target.md"),
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn build_reverse_links_clears_existing_reverse_links_before_recalculation() {
        let mut target = task_without_parent("tasks/target.md");
        target.reverse_links = vec![
            "tasks/stale.md".to_string(),
            "tasks/source.md".to_string(),
            "tasks/source.md".to_string(),
        ];
        let tasks = vec![
            task_with_links("tasks/source.md", &["tasks/target.md"]),
            target,
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn build_reverse_links_ignores_missing_target() {
        let tasks = vec![task_with_links("tasks/source.md", &["tasks/missing.md"])];

        let tasks = build_reverse_links(tasks);

        assert!(tasks[0].reverse_links.is_empty());
        assert!(tasks[0].warnings.is_empty());
    }

    #[test]
    fn build_reverse_links_matches_link_with_dot_prefix() {
        let tasks = vec![
            task_with_links("tasks/source.md", &["./tasks/target.md"]),
            task_without_parent("tasks/target.md"),
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn build_reverse_links_matches_link_with_backslash_separator() {
        let tasks = vec![
            task_with_links("tasks/source.md", &["tasks\\target.md"]),
            task_without_parent("tasks/target.md"),
        ];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[1].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn build_reverse_links_ignores_empty_absolute_and_drive_prefix_link() {
        let cases = [
            "",
            "/tasks/target.md",
            "\\tasks\\target.md",
            "C:\\tasks\\target.md",
        ];

        for link in cases {
            let mut source = task_without_parent("tasks/source.md");
            source.links = vec![link.to_string()];
            let tasks = vec![source, task_without_parent("tasks/target.md")];

            let tasks = build_reverse_links(tasks);

            assert!(tasks[1].reverse_links.is_empty(), "{link}");
        }
    }

    #[test]
    fn build_reverse_links_accepts_empty_tasks() {
        let tasks = build_reverse_links(Vec::new());

        assert!(tasks.is_empty());
    }

    #[test]
    fn build_reverse_links_allows_self_link() {
        let tasks = vec![task_with_links("tasks/source.md", &["tasks/source.md"])];

        let tasks = build_reverse_links(tasks);

        assert_eq!(tasks[0].reverse_links, vec!["tasks/source.md".to_string()]);
    }

    #[test]
    fn direct_cycle_returns_cycle_or_too_deep() {
        let result = validate_parent_hierarchy(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::Cycle,
            }) if file_path == "tasks/a.md"
        ));
    }

    #[test]
    fn multi_node_cycle_returns_cycle_or_too_deep() {
        let result = validate_parent_hierarchy(vec![
            task_with_parent("tasks/a.md", "tasks/b.md"),
            task_with_parent("tasks/b.md", "tasks/c.md"),
            task_with_parent("tasks/c.md", "tasks/a.md"),
        ]);

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::Cycle,
            }) if file_path == "tasks/a.md"
        ));
    }

    #[test]
    fn depth_over_20_returns_cycle_or_too_deep() {
        let result = validate_parent_hierarchy(parent_chain_with_edge_count(21));

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::TooDeep,
            }) if file_path == "tasks/0.md"
        ));
    }

    #[test]
    fn depth_20_is_allowed() {
        let result = validate_parent_hierarchy(parent_chain_with_edge_count(20));

        assert!(result.is_ok());
    }

    #[test]
    fn missing_parent_keeps_warning_without_cycle_error() {
        let tasks =
            validate_parent_hierarchy(vec![task_with_parent("tasks/child.md", "tasks/missing.md")])
                .unwrap();

        assert_eq!(tasks[0].parent, Some("tasks/missing.md".to_string()));
        assert!(tasks[0].warnings.iter().any(|warning| {
            warning.code == TaskWarningCode::ParentNotFound
                && warning.field.as_deref() == Some("parent")
        }));
    }

    #[test]
    fn separator_variation_cycle_is_detected() {
        let result = validate_parent_hierarchy(vec![
            task_with_parent("tasks/a.md", ".\\tasks\\b.md"),
            task_with_parent("tasks/b.md", "./tasks/a.md"),
        ]);

        assert!(matches!(
            result,
            Err(TaskParseError::CycleOrTooDeep {
                file_path,
                reason: ParentHierarchyErrorReason::Cycle,
            }) if file_path == "tasks/a.md"
        ));
    }

    #[test]
    fn cycle_or_too_deep_error_message_includes_file_path_and_reason() {
        let result = validate_parent_hierarchy(vec![task_with_parent("tasks/a.md", "tasks/a.md")]);
        let Err(error) = result else {
            panic!("cycle should return error");
        };

        assert_eq!(
            error.to_string(),
            "parent chain for 'tasks/a.md' contains a cycle"
        );
    }

    #[test]
    fn parent_lookup_accepts_separator_and_current_directory_variations() {
        let cases = ["tasks\\parent.md", "./tasks/parent.md"];

        for parent in cases {
            let tasks = validate_parent_existence(vec![
                task_from("---\ntitle: Parent\nstatus: Todo\n---\n", "tasks/parent.md"),
                task_from(
                    &format!("---\ntitle: Child\nstatus: Todo\nparent: {parent}\n---\n"),
                    "tasks/child.md",
                ),
            ]);

            assert!(
                tasks[1]
                    .warnings
                    .iter()
                    .all(|warning| warning.code != TaskWarningCode::ParentNotFound),
                "{parent}"
            );
        }
    }

    #[test]
    fn parent_lookup_rejects_absolute_or_drive_prefixed_parent_paths() {
        let cases = ["/tasks/parent.md", "C:\\tasks\\parent.md"];

        for parent in cases {
            let tasks = validate_parent_existence(vec![
                task_from("---\ntitle: Parent\nstatus: Todo\n---\n", "tasks/parent.md"),
                task_from(
                    &format!("---\ntitle: Child\nstatus: Todo\nparent: {parent}\n---\n"),
                    "tasks/child.md",
                ),
            ]);

            assert!(
                tasks[1].warnings.iter().any(|warning| {
                    warning.code == TaskWarningCode::ParentNotFound
                        && warning.field.as_deref() == Some("parent")
                }),
                "{parent}"
            );
        }
    }

    #[test]
    fn unknown_fields_are_kept_in_extras_as_json_values() {
        let task = task_from(
            "---\ntitle: Fix bug\nstatus: Todo\nestimate: 3\nmeta:\n  owner: alice\n---\n",
            "tasks/fix-bug.md",
        );

        assert_eq!(task.extras.get("estimate"), Some(&json!(3)));
        assert_eq!(task.extras.get("meta"), Some(&json!({ "owner": "alice" })));
    }

    #[test]
    fn non_string_extra_key_is_excluded_with_warning() {
        let mut extras = serde_yaml_ng::Mapping::new();
        extras.insert(
            serde_yaml_ng::Value::String("title".to_string()),
            serde_yaml_ng::Value::String("Fix bug".to_string()),
        );
        extras.insert(
            serde_yaml_ng::Value::String("status".to_string()),
            serde_yaml_ng::Value::String("Todo".to_string()),
        );
        extras.insert(
            serde_yaml_ng::Value::Sequence(vec![serde_yaml_ng::Value::String("a".to_string())]),
            serde_yaml_ng::Value::String("value".to_string()),
        );
        let task = task_from_parsed(parsed_with_extras(extras), &context("tasks/fix-bug.md"));

        assert_eq!(task.extras, BTreeMap::new());
        assert_eq!(
            task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::NonStringExtraKeyIgnored,
                field: None,
                message: "non-string extra key was ignored".to_string(),
            }]
        );
    }

    #[test]
    fn json_incompatible_extra_value_is_excluded_with_warning() {
        let mut extras = serde_yaml_ng::Mapping::new();
        extras.insert(
            serde_yaml_ng::Value::String("title".to_string()),
            serde_yaml_ng::Value::String("Fix bug".to_string()),
        );
        extras.insert(
            serde_yaml_ng::Value::String("status".to_string()),
            serde_yaml_ng::Value::String("Todo".to_string()),
        );
        extras.insert(
            serde_yaml_ng::Value::String("tagged".to_string()),
            serde_yaml_ng::Value::Tagged(Box::new(serde_yaml_ng::value::TaggedValue {
                tag: serde_yaml_ng::value::Tag::new("custom"),
                value: serde_yaml_ng::Value::String("value".to_string()),
            })),
        );
        let task = task_from_parsed(parsed_with_extras(extras), &context("tasks/fix-bug.md"));

        assert_eq!(task.extras, BTreeMap::new());
        assert_eq!(
            task.warnings,
            vec![TaskWarning {
                code: TaskWarningCode::ExtraValueNotJsonCompatible,
                field: Some("tagged".to_string()),
                message: "extra value is not JSON compatible; value was ignored".to_string(),
            }]
        );
    }

    #[test]
    fn typed_keys_are_excluded_from_extras() {
        let task = task_from(
            "---\ntitle: Fix bug\nstatus: Todo\npriority: High\nlabels: [bug]\nparent: parent.md\nlinks: [related.md]\nextra: kept\n---\n",
            "tasks/fix-bug.md",
        );

        assert_eq!(
            task.extras,
            BTreeMap::from([("extra".to_string(), json!("kept"))])
        );
    }

    #[test]
    fn task_serializes_path_fields_and_warning_codes_as_camel_case() {
        let task = task_from(
            "---\nstatus: Todo\nestimate: 3\n---\nBody\n",
            "tasks/fix-bug.md",
        );

        let json_value = serde_json::to_value(task).unwrap();

        assert_eq!(json_value["filePath"], json!("tasks/fix-bug.md"));
        assert_eq!(json_value["reverseLinks"], json!([]));
        assert_eq!(json_value["extras"], json!({ "estimate": 3 }));
        assert_eq!(
            json_value["warnings"][0]["code"],
            json!("missingTitleUsedFileName")
        );
    }

    #[test]
    fn parent_not_found_warning_code_serializes_as_camel_case() {
        let warning = TaskWarning {
            code: TaskWarningCode::ParentNotFound,
            field: Some("parent".to_string()),
            message: "parent task was not found".to_string(),
        };

        let json_value = serde_json::to_value(warning).unwrap();

        assert_eq!(json_value["code"], json!("parentNotFound"));
    }

    #[test]
    fn task_file_path_payload_is_relative_and_uses_forward_slashes() {
        let cases = [
            ("/project\\tasks\\fix-bug.md", "project/tasks/fix-bug.md"),
            ("C:\\project\\tasks\\fix-bug.md", "project/tasks/fix-bug.md"),
        ];

        for (input_path, expected_path) in cases {
            let task = task_from("---\ntitle: Fix bug\nstatus: Todo\n---\n", input_path);

            assert_eq!(task.id, expected_path);
            assert_eq!(task.file_path, expected_path);
        }
    }

    #[test]
    fn frontmatter_absence_returns_not_task() {
        let result = task_from_markdown(b"# Heading\nbody\n", &context("notes.md"));

        assert!(matches!(result, Err(TaskParseError::NotTask)));
    }

    #[test]
    fn invalid_yaml_or_encoding_returns_frontmatter_error() {
        let invalid_yaml = task_from_markdown(b"---\n: bad\n---\n", &context("bad.md"));
        let invalid_encoding = task_from_markdown(b"\xff\xfe---\n---\n", &context("bad.md"));

        assert!(matches!(invalid_yaml, Err(TaskParseError::Frontmatter(_))));
        assert!(matches!(
            invalid_encoding,
            Err(TaskParseError::Frontmatter(_))
        ));
    }
}
