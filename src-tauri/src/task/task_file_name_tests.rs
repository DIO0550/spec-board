use super::{TaskFileName, TaskFileNameError};
use crate::task::task_title::TaskTitle;
use std::collections::HashSet;

#[test]
fn try_from_str_rejects_empty() {
    assert_eq!(
        TaskFileName::try_from_str(""),
        Err(TaskFileNameError::Empty)
    );
}

#[test]
fn try_from_str_rejects_slash() {
    assert_eq!(
        TaskFileName::try_from_str("a/b.md"),
        Err(TaskFileNameError::ContainsSeparator("a/b.md".into()))
    );
}

#[test]
fn try_from_str_rejects_backslash() {
    assert_eq!(
        TaskFileName::try_from_str("a\\b.md"),
        Err(TaskFileNameError::ContainsSeparator("a\\b.md".into()))
    );
}

#[test]
fn try_from_str_rejects_non_md() {
    assert_eq!(
        TaskFileName::try_from_str("foo.txt"),
        Err(TaskFileNameError::NotMarkdown("foo.txt".into()))
    );
}

#[test]
fn try_from_str_accepts_uppercase_md() {
    let vo = TaskFileName::try_from_str("foo.MD").unwrap();
    assert_eq!(vo.as_str(), "foo.MD");
}

#[test]
fn from_title_converts_ascii_to_kebab_md() {
    let title = TaskTitle::try_from_str("Fix login bug").unwrap();
    let existing = HashSet::new();
    let name = TaskFileName::from_title(&title, &existing).unwrap();
    assert_eq!(name.as_str(), "fix-login-bug.md");
}

#[test]
fn from_title_appends_index_on_collision() {
    let title = TaskTitle::try_from_str("foo").unwrap();
    let mut existing = HashSet::new();
    existing.insert("foo.md".to_string());
    let name = TaskFileName::from_title(&title, &existing).unwrap();
    assert_eq!(name.as_str(), "foo-1.md");
}

#[test]
fn from_title_rejects_empty_kebab_base() {
    // 全 ASCII 非 alphanumeric → kebab 結果が空 → InvalidTitle
    let title = TaskTitle::try_from_str("!@#").unwrap();
    let existing = HashSet::new();
    assert_eq!(
        TaskFileName::from_title(&title, &existing),
        Err(TaskFileNameError::InvalidTitle)
    );
}

#[test]
fn from_explicit_returns_name_as_is_when_no_collision() {
    let existing = HashSet::new();
    let name = TaskFileName::from_explicit("my-task.md", &existing).unwrap();
    assert_eq!(name.as_str(), "my-task.md");
}

#[test]
fn from_explicit_appends_index_on_collision() {
    let mut existing = HashSet::new();
    existing.insert("my-task.md".to_string());
    let name = TaskFileName::from_explicit("my-task.md", &existing).unwrap();
    assert_eq!(name.as_str(), "my-task-1.md");
}

#[test]
fn from_explicit_skips_occupied_indices() {
    let mut existing = HashSet::new();
    existing.insert("t.md".to_string());
    existing.insert("t-1.md".to_string());
    let name = TaskFileName::from_explicit("t.md", &existing).unwrap();
    assert_eq!(name.as_str(), "t-2.md");
}

#[test]
fn from_explicit_normalizes_uppercase_md_extension() {
    let existing = HashSet::new();
    let name = TaskFileName::from_explicit("Task.MD", &existing).unwrap();
    assert_eq!(name.as_str(), "Task.md");
}

#[test]
fn from_explicit_rejects_empty() {
    let existing = HashSet::new();
    assert_eq!(
        TaskFileName::from_explicit("", &existing),
        Err(TaskFileNameError::Empty)
    );
}

#[test]
fn from_explicit_rejects_extension_only_names() {
    let existing = HashSet::new();
    let cases = [".md", ".MD"];
    for value in cases {
        assert_eq!(
            TaskFileName::from_explicit(value, &existing),
            Err(TaskFileNameError::Empty),
            "from_explicit({value:?}) は base が空のため Empty になるべき"
        );
    }
}

#[test]
fn from_explicit_rejects_path_separators() {
    let existing = HashSet::new();
    assert_eq!(
        TaskFileName::from_explicit("dir/task.md", &existing),
        Err(TaskFileNameError::ContainsSeparator("dir/task.md".into()))
    );
    assert_eq!(
        TaskFileName::from_explicit("dir\\task.md", &existing),
        Err(TaskFileNameError::ContainsSeparator("dir\\task.md".into()))
    );
}

#[test]
fn from_explicit_rejects_non_md_extension() {
    let existing = HashSet::new();
    assert_eq!(
        TaskFileName::from_explicit("task.txt", &existing),
        Err(TaskFileNameError::NotMarkdown("task.txt".into()))
    );
}
