//! `RemoveLinkArgs::into_intent` の lenient 変換テスト。

use std::path::{Path, PathBuf};

use super::RemoveLinkArgs;
use crate::task::remove_link::error::RemoveLinkError;

fn args(source: &str, target: &str) -> RemoveLinkArgs {
    RemoveLinkArgs {
        source_file_path: source.to_string(),
        target_file_path: target.to_string(),
    }
}

#[test]
fn accepts_relative_paths() {
    let intent = args("tasks/a.md", "tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect("ok");
    assert_eq!(intent.source, PathBuf::from("tasks/a.md"));
    assert_eq!(intent.target, PathBuf::from("tasks/b.md"));
}

#[test]
fn strips_project_root_for_absolute_paths() {
    let intent = args("/project/tasks/a.md", "/project/tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect("ok");
    assert_eq!(intent.source, PathBuf::from("tasks/a.md"));
    assert_eq!(intent.target, PathBuf::from("tasks/b.md"));
}

#[test]
fn rejects_traversal_in_source() {
    let err = args("../foo.md", "tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect_err("traversal in source");
    assert!(matches!(err, RemoveLinkError::SourceNotFound { .. }));
}

#[test]
fn rejects_traversal_in_target() {
    let err = args("tasks/a.md", "../foo.md")
        .into_intent(Path::new("/project"))
        .expect_err("traversal in target");
    assert!(matches!(err, RemoveLinkError::InvalidTargetPath { .. }));
}

#[test]
fn rejects_empty_source_and_target() {
    let err_source = args("", "tasks/b.md")
        .into_intent(Path::new("/project"))
        .expect_err("empty source");
    assert!(matches!(err_source, RemoveLinkError::SourceNotFound { .. }));

    let err_target = args("tasks/a.md", "  ")
        .into_intent(Path::new("/project"))
        .expect_err("whitespace target");
    assert!(matches!(
        err_target,
        RemoveLinkError::InvalidTargetPath { .. }
    ));
}
