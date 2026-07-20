use serde_json::json;

use super::DeleteTaskArgs;

#[test]
fn deserialize_with_orphan_strategy() {
    let json = json!({ "filePath": "tasks/a.md", "orphanStrategy": "abort" });
    let args: DeleteTaskArgs = serde_json::from_value(json).unwrap();
    assert_eq!(args.file_path, "tasks/a.md");
    assert_eq!(args.orphan_strategy.as_deref(), Some("abort"));
}

#[test]
fn deserialize_without_orphan_strategy() {
    let json = json!({ "filePath": "tasks/a.md" });
    let args: DeleteTaskArgs = serde_json::from_value(json).unwrap();
    assert!(args.orphan_strategy.is_none());
}

#[test]
fn deserialize_missing_file_path_fails() {
    let json = json!({ "orphanStrategy": "abort" });
    assert!(serde_json::from_value::<DeleteTaskArgs>(json).is_err());
}
