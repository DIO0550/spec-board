use super::{TaskTitle, TaskTitleError};

#[test]
fn empty_rejected() {
    assert_eq!(TaskTitle::try_from_str(""), Err(TaskTitleError::Empty));
}

#[test]
fn newline_only_rejected() {
    assert_eq!(TaskTitle::try_from_str("\n"), Err(TaskTitleError::Empty));
}

#[test]
fn whitespace_only_accepted() {
    let title = TaskTitle::try_from_str("   ").unwrap();
    assert_eq!(title.as_str(), "   ");
}

#[test]
fn trailing_newline_trimmed() {
    let title = TaskTitle::try_from_str("foo\n").unwrap();
    assert_eq!(title.as_str(), "foo");
}

#[test]
fn from_lenient_keeps_empty() {
    let title = TaskTitle::from_lenient("");
    assert!(title.is_empty());
}

#[test]
fn serde_round_trip() {
    let title = TaskTitle::try_from_str("Fix login bug").unwrap();
    let serialized = serde_json::to_string(&title).unwrap();
    assert_eq!(serialized, "\"Fix login bug\"");
    let restored: TaskTitle = serde_json::from_str(&serialized).unwrap();
    assert_eq!(restored, title);
}

#[test]
fn serde_deserialize_uses_lenient() {
    let restored: TaskTitle = serde_json::from_str("\"\"").unwrap();
    assert!(restored.is_empty());
}
