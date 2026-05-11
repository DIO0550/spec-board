use super::{ProjectRoot, ProjectRootError};
use std::path::Path;

#[test]
fn try_from_str_rejects_empty() {
    assert_eq!(ProjectRoot::try_from_str(""), Err(ProjectRootError::Empty));
}

#[test]
fn try_from_str_accepts_relative_path() {
    let root = ProjectRoot::try_from_str("./project").unwrap();
    assert_eq!(root.as_path(), Path::new("./project"));
}

#[test]
fn try_from_str_accepts_absolute_path() {
    let root = ProjectRoot::try_from_str("/abs/path").unwrap();
    assert_eq!(root.as_path(), Path::new("/abs/path"));
}

#[test]
fn into_path_buf_returns_inner() {
    let root = ProjectRoot::try_from_str("/p").unwrap();
    let path_buf = root.into_path_buf();
    assert_eq!(path_buf, Path::new("/p"));
}

#[test]
fn from_path_buf_rejects_empty() {
    assert_eq!(
        ProjectRoot::from_path_buf(std::path::PathBuf::new()),
        Err(ProjectRootError::Empty)
    );
}
