use std::path::Path;

use serde_json::json;

use super::super::error::DeleteTaskError;
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

#[test]
fn into_intent_rejects_unsupported_orphan_strategy() {
    let args = DeleteTaskArgs {
        file_path: "tasks/a.md".into(),
        orphan_strategy: Some("clear".into()),
    };
    let err = args
        .into_intent(Path::new("/tmp"))
        .expect_err("should fail");
    assert!(matches!(
        err,
        DeleteTaskError::UnsupportedOrphanStrategy(s) if s == "clear"
    ));
}

#[test]
fn into_intent_accepts_abort_strategy() {
    let args = DeleteTaskArgs {
        file_path: "tasks/a.md".into(),
        orphan_strategy: Some("abort".into()),
    };
    let intent = args.into_intent(Path::new("/tmp")).expect("should succeed");
    assert_eq!(intent.file_path.to_str().unwrap(), "tasks/a.md");
}
