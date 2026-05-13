use std::collections::HashSet;
use std::path::{Path, PathBuf};

use super::{build_existing_filenames_in_dir, build_new_filename, resolve_target_dir};
use crate::task::task_index::Task;
use crate::task::task_title::TaskTitle;
use crate::task::warning::TaskWarning;

use super::super::error::CreateTaskError;

fn set_of(items: &[&str]) -> HashSet<String> {
    items.iter().map(|s| (*s).to_string()).collect()
}

fn make_task(file_path: &str, parent: Option<&str>) -> Task {
    Task {
        id: file_path.into(),
        file_path: file_path.into(),
        title: "Task".into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: parent.map(Into::into),
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: std::collections::BTreeMap::new(),
        warnings: Vec::<TaskWarning>::new(),
    }
}

fn task_without_parent(file_path: &str) -> Task {
    make_task(file_path, None)
}

fn title(value: &str) -> TaskTitle {
    TaskTitle::from_lenient(value.to_string())
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
    for (raw_title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(&title(raw_title), &existing).expect(label);
        assert_eq!(actual.as_str(), expected, "{label}");
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
    for (raw_title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(&title(raw_title), &existing).expect(label);
        assert_eq!(actual.as_str(), expected, "{label}");
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
    for (raw_title, existing, expected, label) in cases {
        let existing = set_of(&existing);
        let actual = build_new_filename(&title(raw_title), &existing).expect(label);
        assert_eq!(actual.as_str(), expected, "{label}");
    }
}

#[test]
fn build_new_filename_invalid_title_cases() {
    let cases: Vec<(&str, &str)> = vec![
        ("", "empty title"),
        ("   ", "ASCII whitespace only"),
        ("!!!", "symbols only (kebab result empty)"),
    ];
    for (raw_title, label) in cases {
        let existing: HashSet<String> = HashSet::new();
        let actual = build_new_filename(&title(raw_title), &existing);
        assert_eq!(actual, Err(CreateTaskError::InvalidTitle), "{label}");
    }
}

#[test]
fn resolve_target_dir_returns_tasks_when_parent_none() {
    let snapshot: Vec<Task> = Vec::new();
    assert_eq!(PathBuf::from("tasks"), resolve_target_dir(None, &snapshot));
}

#[test]
fn resolve_target_dir_returns_tasks_when_parent_in_tasks_dir() {
    let snapshot = vec![task_without_parent("tasks/parent.md")];
    assert_eq!(
        PathBuf::from("tasks"),
        resolve_target_dir(Some(0), &snapshot)
    );
}

#[test]
fn resolve_target_dir_returns_parent_dirname_for_nested_parent() {
    let snapshot = vec![task_without_parent("issues/82/parent.md")];
    assert_eq!(
        PathBuf::from("issues/82"),
        resolve_target_dir(Some(0), &snapshot)
    );
}

#[test]
fn build_existing_filenames_collects_only_files_in_target_dir() {
    let snapshot = vec![
        task_without_parent("tasks/a.md"),
        task_without_parent("tasks/b.md"),
        task_without_parent("issues/x.md"),
    ];
    let names = build_existing_filenames_in_dir(&snapshot, Path::new("tasks"));
    assert_eq!(set_of(&["a.md", "b.md"]), names);
}

#[test]
fn build_existing_filenames_excludes_other_directories() {
    let snapshot = vec![
        task_without_parent("tasks/a.md"),
        task_without_parent("notes/a.md"),
    ];
    let names = build_existing_filenames_in_dir(&snapshot, Path::new("notes"));
    assert_eq!(set_of(&["a.md"]), names);
}
