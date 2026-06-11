use std::path::Path;

use super::UpdateTaskArgs;
use crate::task::update::error::UpdateTaskError;

fn raw_args(file_path: &str) -> UpdateTaskArgs {
    UpdateTaskArgs {
        draft: None,
        file_path: file_path.to_string(),
        title: None,
        status: None,
        priority: None,
        milestone: None,
        labels: None,
        parent: None,
        body: None,
    }
}

#[test]
fn absolute_inside_root_succeeds_and_relative_path_is_stripped() {
    let root = Path::new("/project");
    let args = raw_args("/project/tasks/foo.md");
    let intent = args.into_intent(root).expect("ok");
    assert_eq!(Path::new("tasks/foo.md"), intent.file_path.as_path());
}

#[test]
fn absolute_outside_root_returns_invalid_path() {
    let root = Path::new("/project");
    let args = raw_args("/elsewhere/foo.md");
    let err = args.into_intent(root).expect_err("should fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn plain_relative_md_path_succeeds() {
    let root = Path::new("/project");
    let intent = raw_args("tasks/foo.md").into_intent(root).expect("ok");
    assert_eq!(Path::new("tasks/foo.md"), intent.file_path.as_path());
}

#[test]
fn dot_prefix_is_normalized() {
    let root = Path::new("/project");
    let intent = raw_args("./tasks/foo.md").into_intent(root).expect("ok");
    assert_eq!(Path::new("tasks/foo.md"), intent.file_path.as_path());
}

#[test]
fn parent_dir_segment_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("../etc/passwd")
        .into_intent(root)
        .expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn non_md_extension_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("tasks/foo.txt")
        .into_intent(root)
        .expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn double_extension_md_bak_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("tasks/foo.md.bak")
        .into_intent(root)
        .expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn no_extension_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("tasks/foo").into_intent(root).expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn directory_path_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("tasks/").into_intent(root).expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn backslash_separator_is_normalized_to_forward_slash() {
    let root = Path::new("/project");
    let intent = raw_args("tasks\\foo.md").into_intent(root).expect("ok");
    assert_eq!(Path::new("tasks/foo.md"), intent.file_path.as_path());
}

#[test]
fn windows_drive_prefix_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("C:\\Users\\foo.md")
        .into_intent(root)
        .expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn posix_absolute_outside_root_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("/abs/outside.md")
        .into_intent(root)
        .expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn empty_input_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("").into_intent(root).expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn whitespace_only_input_is_rejected() {
    let root = Path::new("/project");
    let err = raw_args("   ").into_intent(root).expect_err("fail");
    assert!(matches!(err, UpdateTaskError::InvalidPath(_)));
}

#[test]
fn priority_string_is_normalized_to_enum() {
    use crate::task::frontmatter::Priority;
    let root = Path::new("/project");
    let mut args = raw_args("tasks/foo.md");
    args.priority = Some("high".into());
    let intent = args.into_intent(root).expect("ok");
    assert_eq!(Some(Priority::High), intent.priority);
}

#[test]
fn invalid_priority_string_becomes_none() {
    let root = Path::new("/project");
    let mut args = raw_args("tasks/foo.md");
    args.priority = Some("urgent".into());
    let intent = args.into_intent(root).expect("ok");
    assert_eq!(None, intent.priority);
}

#[test]
fn draft_three_state_maps_to_intent() {
    let root = Path::new("/project");
    let cases = [
        (Some(true), Some(true)),
        (Some(false), Some(false)),
        (None, None),
    ];
    for (input, expected) in cases {
        let mut args = raw_args("tasks/foo.md");
        args.draft = input;
        let intent = args.into_intent(root).expect("ok");
        assert_eq!(intent.draft, expected, "input={input:?}");
    }
}
