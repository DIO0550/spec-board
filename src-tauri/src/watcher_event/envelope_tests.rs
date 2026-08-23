use super::*;

use crate::task::task_index::{ParsedTaskBuilder, Task};

fn sample_task() -> Task {
    ParsedTaskBuilder::new("tasks/a.md").title("A").resolve()
}

fn project_key() -> ProjectKey {
    ProjectKey::from_root(std::path::Path::new("/home/user/specs"))
}

fn upsert_envelope() -> WatcherEnvelope<TaskUpsertPayload> {
    build_envelope(
        &project_key(),
        ProjectGeneration::from_raw(3),
        TasksRevision::from_raw(42),
        EventSeq::from_raw(17),
        TaskUpsertPayload {
            task: sample_task().into(),
        },
    )
}

#[test]
fn envelope_serializes_seven_camel_case_keys() {
    let json = serde_json::to_value(upsert_envelope()).expect("serialize");

    let mut keys: Vec<&String> = json.as_object().expect("object").keys().collect();
    keys.sort();
    assert_eq!(
        vec![
            "cacheMutating",
            "changeId",
            "eventSeq",
            "generation",
            "payload",
            "projectKey",
            "revision"
        ],
        keys
    );
}

#[test]
fn envelope_carries_the_identity_and_ordering_fields_verbatim() {
    let json = serde_json::to_value(upsert_envelope()).expect("serialize");

    assert_eq!("/home/user/specs", json["projectKey"]);
    assert_eq!(3, json["generation"]);
    assert_eq!(42, json["revision"]);
    assert_eq!(17, json["eventSeq"]);
    assert_eq!("tasks/a.md", json["payload"]["task"]["filePath"]);
}

#[test]
fn build_envelope_derives_change_id_from_generation_and_event_seq() {
    let expected = ChangeId::compose(ProjectGeneration::from_raw(3), EventSeq::from_raw(17));

    let envelope = upsert_envelope();

    assert_eq!(expected, envelope.change_id);
}

/// 型パラメータ経由で `CACHE_MUTATING` を読む。定数を直接 assert すると
/// clippy がコンパイル時定数の assertion として弾くため、関数越しに評価する。
fn cache_mutating<P: EnvelopePayload>() -> bool {
    P::CACHE_MUTATING
}

#[test]
fn cache_mutating_is_derived_from_the_payload_type() {
    assert!(cache_mutating::<TaskUpsertPayload>());
    assert!(cache_mutating::<TaskDeletedPayload>());
    assert!(cache_mutating::<ResyncRequiredPayload>());
    assert!(
        !cache_mutating::<DiagnosticPayload>(),
        "診断は cache を変えないので false。true にすると FE が revision の単調性を要求して通知が届かなくなる"
    );
}

#[test]
fn build_envelope_writes_the_payload_derived_cache_mutating_flag() {
    let mutating = serde_json::to_value(upsert_envelope()).expect("serialize");
    let diagnostic = serde_json::to_value(build_envelope(
        &project_key(),
        ProjectGeneration::from_raw(3),
        TasksRevision::from_raw(42),
        EventSeq::from_raw(18),
        DiagnosticPayload {
            code: DiagnosticCode::ResourceExhausted,
            message: "inotify watch limit reached".to_string(),
            paths: vec!["tasks".to_string()],
        },
    ))
    .expect("serialize");

    assert_eq!(true, mutating["cacheMutating"]);
    assert_eq!(false, diagnostic["cacheMutating"]);
}

#[test]
fn task_deleted_payload_serializes_the_file_path_only() {
    let json = serde_json::to_value(TaskDeletedPayload {
        file_path: "tasks/done.md".to_string(),
    })
    .expect("serialize");

    assert_eq!(serde_json::json!({ "filePath": "tasks/done.md" }), json);
}

#[test]
fn resync_required_payload_carries_a_reason_without_any_task() {
    let json = serde_json::to_value(ResyncRequiredPayload {
        reason: ResyncReason::Rescan,
    })
    .expect("serialize");

    assert_eq!(serde_json::json!({ "reason": "rescan" }), json);
}

#[test]
fn diagnostic_payload_serializes_code_message_and_paths() {
    let json = serde_json::to_value(DiagnosticPayload {
        code: DiagnosticCode::WatchPathUnavailable,
        message: "watched directory disappeared".to_string(),
        paths: vec!["tasks".to_string()],
    })
    .expect("serialize");

    assert_eq!(
        serde_json::json!({
            "code": "watchPathUnavailable",
            "message": "watched directory disappeared",
            "paths": ["tasks"],
        }),
        json
    );
}

#[test]
fn diagnostic_code_serializes_every_variant_in_camel_case() {
    let cases = [
        (DiagnosticCode::WatchPathUnavailable, "watchPathUnavailable"),
        (DiagnosticCode::ResourceExhausted, "resourceExhausted"),
        (DiagnosticCode::PermissionDenied, "permissionDenied"),
        (DiagnosticCode::Io, "io"),
        (DiagnosticCode::Unknown, "unknown"),
        (DiagnosticCode::RescanFailed, "rescanFailed"),
    ];

    for (code, expected) in cases {
        let json = serde_json::to_value(code).expect("serialize");
        assert_eq!(serde_json::Value::from(expected), json);
    }
}

#[test]
fn envelope_round_trips_through_serde() {
    let envelope = upsert_envelope();

    let json = serde_json::to_string(&envelope).expect("serialize");
    let restored: WatcherEnvelope<TaskUpsertPayload> =
        serde_json::from_str(&json).expect("deserialize");

    assert_eq!(envelope, restored);
}

#[test]
fn event_names_are_the_contract_shared_with_the_frontend() {
    assert_eq!("task-created", EVENT_TASK_CREATED);
    assert_eq!("task-updated", EVENT_TASK_UPDATED);
    assert_eq!("task-deleted", EVENT_TASK_DELETED);
    assert_eq!("watcher-resync-required", EVENT_RESYNC_REQUIRED);
    assert_eq!("watcher-diagnostic", EVENT_DIAGNOSTIC);
}
