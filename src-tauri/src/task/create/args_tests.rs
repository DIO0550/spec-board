//! `CreateTaskArgs` の deserialize 後方互換と `From<CreateTaskArgs>` 変換のテスト。

use super::CreateTaskArgs;
use crate::task::task_index::CreateTaskIntent;

#[test]
fn deserializes_without_links_key_to_empty_vec() {
    let json = r#"{"title":"T","status":"Todo"}"#;
    let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
    assert!(args.links.is_empty());
}

#[test]
fn deserializes_links_array() {
    let json = r#"{"title":"T","status":"Todo","links":["tasks/a.md","tasks/b.md"]}"#;
    let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(
        args.links,
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()]
    );
}

#[test]
fn from_args_moves_links_raw_without_normalization() {
    let args = CreateTaskArgs {
        title: "T".into(),
        status: "Todo".into(),
        priority: None,
        labels: Vec::new(),
        parent: None,
        links: vec!["./tasks/a.md".into(), "./tasks/a.md".into()],
        body: None,
    };
    let intent = CreateTaskIntent::from(args);
    // From は dedup も正規化もせず raw のまま詰める（正規化は plan_create の責務）。
    assert_eq!(
        intent.links,
        vec!["./tasks/a.md".to_string(), "./tasks/a.md".to_string()]
    );
}
