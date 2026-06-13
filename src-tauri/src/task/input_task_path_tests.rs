//! `InputTaskPath::resolve` の正規化・検証テスト。

use std::path::{Path, PathBuf};

use super::{InputPathRejected, InputTaskPath};

fn resolve(raw: &str, require_md: bool) -> Result<PathBuf, InputPathRejected> {
    InputTaskPath::resolve(raw, Path::new("/project"), require_md).map(InputTaskPath::into_path_buf)
}

#[test]
fn relative_path_is_passed_through() {
    assert_eq!(
        resolve("tasks/a.md", false),
        Ok(PathBuf::from("tasks/a.md"))
    );
}

#[test]
fn absolute_inside_root_is_stripped() {
    assert_eq!(
        resolve("/project/tasks/a.md", false),
        Ok(PathBuf::from("tasks/a.md"))
    );
}

#[test]
fn absolute_outside_root_is_rejected() {
    assert_eq!(resolve("/elsewhere/a.md", false), Err(InputPathRejected));
}

#[test]
fn dot_prefix_and_backslash_are_normalized() {
    assert_eq!(
        resolve("./tasks\\a.md", false),
        Ok(PathBuf::from("tasks/a.md"))
    );
}

#[test]
fn empty_is_rejected() {
    assert_eq!(resolve("", false), Err(InputPathRejected));
}

#[test]
fn whitespace_only_is_rejected() {
    assert_eq!(resolve("   ", false), Err(InputPathRejected));
}

#[test]
fn parent_dir_segment_is_rejected() {
    assert_eq!(resolve("../foo.md", false), Err(InputPathRejected));
}

#[test]
fn windows_drive_prefix_is_rejected() {
    assert_eq!(resolve("C:\\Users\\foo.md", false), Err(InputPathRejected));
}

#[test]
fn require_md_accepts_md_extension() {
    assert_eq!(
        resolve("tasks/foo.md", true),
        Ok(PathBuf::from("tasks/foo.md"))
    );
}

#[test]
fn require_md_rejects_non_md_extension() {
    assert_eq!(resolve("tasks/foo.txt", true), Err(InputPathRejected));
}

#[test]
fn require_md_rejects_no_extension() {
    assert_eq!(resolve("tasks/foo", true), Err(InputPathRejected));
}

#[test]
fn require_md_rejects_double_extension() {
    assert_eq!(resolve("tasks/foo.md.bak", true), Err(InputPathRejected));
}

#[test]
fn require_md_rejects_directory_path() {
    assert_eq!(resolve("tasks/", true), Err(InputPathRejected));
}

#[test]
fn require_false_accepts_non_md_extension() {
    assert_eq!(
        resolve("tasks/a.txt", false),
        Ok(PathBuf::from("tasks/a.txt"))
    );
}
