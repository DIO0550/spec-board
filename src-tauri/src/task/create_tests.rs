use super::super::frontmatter::Priority;
use super::super::index::{TaskExtras, TaskWarning};
use super::*;

fn set_of(items: &[&str]) -> HashSet<String> {
    items.iter().map(|s| (*s).to_string()).collect()
}

fn make_task(file_path: &str, parent: Option<&str>) -> Task {
    Task {
        id: file_path.into(),
        file_path: file_path.into(),
        title: "Task".into(),
        status: "Todo".into(),
        priority: None::<Priority>,
        labels: Vec::new(),
        parent: parent.map(Into::into),
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: TaskExtras::new(),
        warnings: Vec::<TaskWarning>::new(),
    }
}

fn task_with_parent(file_path: &str, parent: &str) -> Task {
    make_task(file_path, Some(parent))
}

fn task_without_parent(file_path: &str) -> Task {
    make_task(file_path, None)
}

/// 新規タスク → 起点 parent (`tasks/0.md`) → ... → root (`tasks/{edge_count}.md`) の
/// chain を表す Task 一覧を作る。`tasks[0]` が新規タスクの parent 候補。
/// 戻り値の長さは `edge_count + 1`、parent 側 edge 数は `edge_count`。
fn parent_chain_with_edge_count(edge_count: usize) -> Vec<Task> {
    let mut tasks = Vec::with_capacity(edge_count + 1);
    for index in 0..edge_count {
        tasks.push(task_with_parent(
            &format!("tasks/{index}.md"),
            &format!("tasks/{}.md", index + 1),
        ));
    }
    tasks.push(task_without_parent(&format!("tasks/{edge_count}.md")));
    tasks
}

#[test]
fn build_new_filename_ascii_no_collision_cases() {
    let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
        (
            "Fix Login Bug",
            vec![],
            "fix-login-bug.md",
            "ascii basic / empty existing",
        ),
        (
            "Refactor API",
            vec!["other.md"],
            "refactor-api.md",
            "ascii basic / non-colliding existing",
        ),
    ];
    for (title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(title, &existing).expect(label);
        assert_eq!(actual, expected, "{label}");
    }
}

#[test]
fn build_new_filename_ascii_collision_cases() {
    let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
        (
            "Fix Login Bug",
            vec!["fix-login-bug.md"],
            "fix-login-bug-1.md",
            "single collision",
        ),
        (
            "x",
            vec!["x.md", "x-1.md", "x-2.md"],
            "x-3.md",
            "consecutive collisions",
        ),
    ];
    for (title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(title, &existing).expect(label);
        assert_eq!(actual, expected, "{label}");
    }
}

#[test]
fn build_new_filename_non_ascii_cases() {
    let cases: Vec<(&str, Vec<&str>, &str, &str)> = vec![
        ("バグ修正", vec![], "バグ修正.md", "pure CJK / no collision"),
        (
            "タスク",
            vec!["タスク.md"],
            "タスク-1.md",
            "pure CJK / single collision",
        ),
        (
            "タスク",
            vec!["タスク.md", "タスク-1.md"],
            "タスク-2.md",
            "pure CJK / consecutive collisions",
        ),
        (
            "タスク 1",
            vec!["タスク-1.md"],
            "タスク-1-1.md",
            "mixed CJK + ASCII / numeric suffix base collision",
        ),
    ];
    for (title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(title, &existing).expect(label);
        assert_eq!(actual, expected, "{label}");
    }
}

#[test]
fn build_new_filename_invalid_title_cases() {
    let cases: Vec<(&str, &str)> = vec![
        ("", "empty title"),
        ("   ", "ASCII whitespace only"),
        ("!!!", "symbols only (kebab result empty)"),
    ];
    for (title, label) in cases {
        let existing: HashSet<String> = HashSet::new();
        let actual = build_new_filename(title, &existing);
        assert_eq!(actual, Err(CreateTaskError::InvalidTitle), "{label}");
    }
}

#[test]
fn validate_parent_for_new_task_ok_cases() {
    let single = vec![task_without_parent("tasks/a.md")];
    let chain_19 = parent_chain_with_edge_count(19);

    let cases: Vec<(Option<&str>, &[Task], &str)> = vec![
        (None, &[], "parent=None / empty existing"),
        (None, single.as_slice(), "parent=None / non-empty existing"),
        (
            Some("tasks/a.md"),
            single.as_slice(),
            "existing root parent",
        ),
        (
            Some("./tasks/a.md"),
            single.as_slice(),
            "leading ./ normalized",
        ),
        (
            Some("tasks\\a.md"),
            single.as_slice(),
            "backslash separator",
        ),
        (
            Some("tasks/0.md"),
            chain_19.as_slice(),
            "edge 19 chain (total 20 = MAX)",
        ),
    ];
    for (parent, tasks, label) in cases {
        assert_eq!(
            validate_parent_for_new_task(parent, tasks),
            Ok(()),
            "{label}"
        );
    }
}

#[test]
fn validate_parent_for_new_task_not_found_cases() {
    let single = vec![task_without_parent("tasks/a.md")];

    let cases: Vec<(&str, &[Task], &str)> = vec![
        ("tasks/missing.md", single.as_slice(), "no matching path"),
        ("", single.as_slice(), "empty parent string"),
        ("/abs/path.md", single.as_slice(), "absolute path"),
        ("C:\\foo.md", single.as_slice(), "windows drive prefix"),
        (
            "tasks/self.md",
            single.as_slice(),
            "self reference (new task not yet registered)",
        ),
        ("tasks/a.md", &[] as &[Task], "empty existing tasks"),
    ];
    for (parent, tasks, label) in cases {
        assert_eq!(
            validate_parent_for_new_task(Some(parent), tasks),
            Err(CreateTaskError::ParentNotFound {
                parent: parent.to_string(),
            }),
            "{label}"
        );
    }
}

#[test]
fn validate_parent_for_new_task_cycle_or_too_deep_cases() {
    let chain_20 = parent_chain_with_edge_count(20);
    let cycle_pair = vec![
        task_with_parent("tasks/a.md", "tasks/b.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ];

    let cases: Vec<(&str, &[Task], ParentHierarchyErrorReason, &str)> = vec![
        (
            "tasks/0.md",
            chain_20.as_slice(),
            ParentHierarchyErrorReason::TooDeep,
            "edge 20 chain (total 21 exceeds MAX)",
        ),
        (
            "tasks/a.md",
            cycle_pair.as_slice(),
            ParentHierarchyErrorReason::Cycle,
            "two-node cycle a <-> b",
        ),
    ];
    for (parent, tasks, expected_reason, label) in cases {
        assert_eq!(
            validate_parent_for_new_task(Some(parent), tasks),
            Err(CreateTaskError::ParentCycleOrTooDeep {
                parent: parent.to_string(),
                reason: expected_reason,
            }),
            "{label}"
        );
    }
}
