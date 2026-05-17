//! `AddLinkArgs::into_intent` の lenient 変換テスト。

use std::path::{Path, PathBuf};

use super::AddLinkArgs;
use crate::task::add_link::error::AddLinkError;

fn args(source: &str, target: &str) -> AddLinkArgs {
    AddLinkArgs {
        source_path: source.to_string(),
        target_path: target.to_string(),
    }
}

#[test]
fn into_intent_relative_paths_are_passed_through() {
    let intent = args("tasks/a.md", "tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect("ok");
    assert_eq!(intent.source, PathBuf::from("tasks/a.md"));
    assert_eq!(intent.target, PathBuf::from("tasks/b.md"));
}

#[test]
fn into_intent_absolute_paths_are_stripped_by_project_root() {
    let intent = args("/project/tasks/a.md", "/project/tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect("ok");
    assert_eq!(intent.source, PathBuf::from("tasks/a.md"));
    assert_eq!(intent.target, PathBuf::from("tasks/b.md"));
}

#[test]
fn into_intent_empty_source_yields_source_not_found() {
    let err = args("", "tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect_err("empty source");
    assert!(matches!(err, AddLinkError::SourceNotFound { .. }));
}

#[test]
fn into_intent_empty_target_yields_target_not_found() {
    let err = args("tasks/a.md", "")
        .into_intent(Path::new("/project"))
        .expect_err("empty target");
    assert!(matches!(err, AddLinkError::TargetNotFound { .. }));
}

#[test]
fn into_intent_normalizes_dot_prefix_and_backslash() {
    let intent = args("./tasks/a.md", "tasks\\b.md")
        .into_intent(Path::new("/project"))
        .expect("ok");
    assert_eq!(intent.source, PathBuf::from("tasks/a.md"));
    assert_eq!(intent.target, PathBuf::from("tasks/b.md"));
}
