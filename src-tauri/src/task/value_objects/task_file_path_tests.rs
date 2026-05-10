use super::{TaskFilePath, TaskFilePathError};
use std::collections::HashMap;
use std::path::Path;

#[test]
fn try_from_str_rejects_empty() {
    assert_eq!(
        TaskFilePath::try_from_str(""),
        Err(TaskFilePathError::Empty)
    );
}

#[test]
fn try_from_str_rejects_backslash() {
    assert_eq!(
        TaskFilePath::try_from_str("tasks\\foo.md"),
        Err(TaskFilePathError::BackslashNotAllowed(
            "tasks\\foo.md".into()
        ))
    );
}

#[test]
fn try_from_str_rejects_non_md_extension() {
    assert_eq!(
        TaskFilePath::try_from_str("tasks/foo.txt"),
        Err(TaskFilePathError::NotMarkdown("tasks/foo.txt".into()))
    );
}

#[test]
fn try_from_str_rejects_leading_slash() {
    assert_eq!(
        TaskFilePath::try_from_str("/foo.md"),
        Err(TaskFilePathError::LeadingOrTrailingSlash("/foo.md".into()))
    );
}

#[test]
fn try_from_str_rejects_trailing_slash() {
    assert_eq!(
        TaskFilePath::try_from_str("foo.md/"),
        Err(TaskFilePathError::LeadingOrTrailingSlash("foo.md/".into()))
    );
}

#[test]
fn try_from_str_accepts_uppercase_md() {
    let vo = TaskFilePath::try_from_str("tasks/foo.MD").unwrap();
    assert_eq!(vo.as_str(), "tasks/foo.MD");
}

#[test]
fn from_relative_path_normalizes_backslash() {
    let vo = TaskFilePath::from_relative_path(Path::new("tasks\\foo.md")).unwrap();
    assert_eq!(vo.as_str(), "tasks/foo.md");
}

#[test]
fn from_relative_path_strips_dot_segment() {
    let vo = TaskFilePath::from_relative_path(Path::new("./tasks/foo.md")).unwrap();
    assert_eq!(vo.as_str(), "tasks/foo.md");
}

#[test]
fn from_relative_path_strips_drive_prefix() {
    let vo = TaskFilePath::from_relative_path(Path::new("C:/tasks/foo.md")).unwrap();
    assert_eq!(vo.as_str(), "tasks/foo.md");
}

#[test]
fn from_lenient_keeps_empty() {
    let vo = TaskFilePath::from_lenient("");
    assert!(vo.is_empty());
    assert_eq!(vo.as_str(), "");
}

#[test]
fn from_lenient_replaces_backslash() {
    let vo = TaskFilePath::from_lenient("tasks\\foo.md");
    assert_eq!(vo.as_str(), "tasks/foo.md");
}

#[test]
fn from_lenient_keeps_non_md() {
    let vo = TaskFilePath::from_lenient("tasks/foo.txt");
    assert_eq!(vo.as_str(), "tasks/foo.txt");
}

#[test]
fn from_lenient_keeps_dot_prefix() {
    let vo = TaskFilePath::from_lenient("./tasks/foo.md");
    assert_eq!(vo.as_str(), "./tasks/foo.md");
}

#[test]
fn serde_round_trip() {
    let vo = TaskFilePath::try_from_str("tasks/foo.md").unwrap();
    let serialized = serde_json::to_string(&vo).unwrap();
    assert_eq!(serialized, "\"tasks/foo.md\"");
    let restored: TaskFilePath = serde_json::from_str(&serialized).unwrap();
    assert_eq!(restored, vo);
}

#[test]
fn serde_deserialize_uses_lenient() {
    // strict ではエラーになる "" でも deserialize は通る（lenient 経路）。
    let restored: TaskFilePath = serde_json::from_str("\"\"").unwrap();
    assert!(restored.is_empty());
}

#[test]
fn hashmap_key_compatibility() {
    let mut map: HashMap<TaskFilePath, u32> = HashMap::new();
    let key = TaskFilePath::try_from_str("tasks/foo.md").unwrap();
    map.insert(key.clone(), 42);
    assert_eq!(map.get(&key), Some(&42));
}

#[test]
fn partial_eq_with_str() {
    let vo = TaskFilePath::try_from_str("tasks/foo.md").unwrap();
    assert!(vo == "tasks/foo.md");
    assert!("tasks/foo.md" == vo);
}

#[test]
fn display_outputs_inner_string() {
    let vo = TaskFilePath::try_from_str("tasks/foo.md").unwrap();
    assert_eq!(format!("{vo}"), "tasks/foo.md");
}
