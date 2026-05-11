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
