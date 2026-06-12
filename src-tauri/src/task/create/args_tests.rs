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
fn deserializes_without_file_name_key_to_none() {
    // 旧 FE 相当の JSON（fileName キーなし）でも deserialize でき、None に倒れる。
    let json = r#"{"title":"T","status":"Todo"}"#;
    let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(args.file_name, None);
}

#[test]
fn deserializes_file_name_key() {
    let json = r#"{"title":"T","status":"Todo","fileName":"custom-name.md"}"#;
    let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(args.file_name, Some("custom-name.md".to_string()));
}

#[test]
fn from_args_maps_file_name_to_intent() {
    let args = CreateTaskArgs {
        draft: false,
        due: None,
        title: "T".into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        links: Vec::new(),
        body: None,
        file_name: Some("custom-name.md".into()),
    };
    let intent = CreateTaskIntent::from(args);
    assert_eq!(intent.file_name, Some("custom-name.md".to_string()));
}

#[test]
fn from_args_moves_links_raw_without_normalization() {
    let args = CreateTaskArgs {
        draft: false,
        due: None,
        title: "T".into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        links: vec!["./tasks/a.md".into(), "./tasks/a.md".into()],
        body: None,
        file_name: None,
    };
    let intent = CreateTaskIntent::from(args);
    // From は dedup も正規化もせず raw のまま詰める（正規化は plan_create の責務）。
    assert_eq!(
        intent.links,
        vec!["./tasks/a.md".to_string(), "./tasks/a.md".to_string()]
    );
}

#[test]
fn deserializes_due_key_and_maps_to_intent() {
    let json = r#"{"title":"T","status":"Todo","due":"2026-07-01"}"#;
    let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(args.due, Some("2026-07-01".to_string()));
    let intent = CreateTaskIntent::from(args);
    assert_eq!(intent.due, Some("2026-07-01".to_string()));
}

#[test]
fn deserializes_without_due_key_to_none() {
    let json = r#"{"title":"T","status":"Todo"}"#;
    let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(args.due, None);
}

#[test]
fn deserializes_draft_variants_and_maps_to_intent() {
    let cases = [
        (r#"{"title":"T","status":"Todo","draft":true}"#, true),
        (r#"{"title":"T","status":"Todo","draft":false}"#, false),
        (r#"{"title":"T","status":"Todo"}"#, false),
    ];
    for (json, expected) in cases {
        let args: CreateTaskArgs = serde_json::from_str(json).expect("should deserialize");
        let intent = CreateTaskIntent::from(args);
        assert_eq!(intent.draft, expected, "json={json}");
    }
}
