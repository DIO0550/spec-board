use super::*;

use crate::watcher_event::envelope::{
    DiagnosticCode, DiagnosticPayload, ResyncReason, ResyncRequiredPayload, TaskDeletedPayload,
    TaskUpsertPayload, WatcherEnvelope, EVENT_DIAGNOSTIC, EVENT_RESYNC_REQUIRED,
    EVENT_TASK_CREATED, EVENT_TASK_DELETED, EVENT_TASK_UPDATED,
};

fn case_for(event_name: &str) -> serde_json::Value {
    load_fixture()
        .cases
        .into_iter()
        .find(|case| case.event_name == event_name)
        .unwrap_or_else(|| panic!("fixture must contain a `{event_name}` case"))
        .envelope
}

#[test]
fn fixture_declares_every_watcher_event_exactly_once() {
    let fixture = load_fixture();

    let mut names: Vec<String> = fixture.cases.iter().map(|c| c.event_name.clone()).collect();
    names.sort();
    assert_eq!(
        vec![
            EVENT_TASK_CREATED.to_string(),
            EVENT_TASK_DELETED.to_string(),
            EVENT_TASK_UPDATED.to_string(),
            EVENT_DIAGNOSTIC.to_string(),
            EVENT_RESYNC_REQUIRED.to_string(),
        ]
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>(),
        names
    );
    assert!(!fixture.description.is_empty());
}

#[test]
fn upsert_cases_deserialize_into_the_task_upsert_payload() {
    for event_name in [EVENT_TASK_CREATED, EVENT_TASK_UPDATED] {
        let envelope: WatcherEnvelope<TaskUpsertPayload> =
            serde_json::from_value(case_for(event_name)).expect("deserialize upsert envelope");

        assert!(envelope.cache_mutating, "{event_name} は cache を変更する");
        assert_eq!(
            envelope.payload.task.file_path.as_str(),
            envelope.payload.task.id.as_str()
        );
    }
}

#[test]
fn deleted_case_deserializes_into_the_task_deleted_payload() {
    let envelope: WatcherEnvelope<TaskDeletedPayload> =
        serde_json::from_value(case_for(EVENT_TASK_DELETED)).expect("deserialize deleted envelope");

    assert!(envelope.cache_mutating);
    assert_eq!("tasks/done.md", envelope.payload.file_path);
}

#[test]
fn resync_required_case_deserializes_without_carrying_any_task() {
    let raw = case_for(EVENT_RESYNC_REQUIRED);
    assert!(
        raw["payload"].get("task").is_none(),
        "resync 要求に snapshot を同梱してはならない"
    );

    let envelope: WatcherEnvelope<ResyncRequiredPayload> =
        serde_json::from_value(raw).expect("deserialize resync envelope");

    assert!(envelope.cache_mutating);
    assert_eq!(ResyncReason::Rescan, envelope.payload.reason);
}

#[test]
fn diagnostic_case_is_declared_as_not_cache_mutating() {
    let envelope: WatcherEnvelope<DiagnosticPayload> =
        serde_json::from_value(case_for(EVENT_DIAGNOSTIC))
            .expect("deserialize diagnostic envelope");

    assert!(
        !envelope.cache_mutating,
        "診断が true だと FE の revision 単調性判定に落ちて toast が出ない"
    );
    assert_eq!(DiagnosticCode::ResourceExhausted, envelope.payload.code);
}

#[test]
fn every_case_composes_change_id_from_generation_and_event_seq() {
    for case in load_fixture().cases {
        let expected = format!(
            "{}-{}",
            case.envelope["generation"], case.envelope["eventSeq"]
        );
        assert_eq!(
            expected, case.envelope["changeId"],
            "{} の changeId が (generation, eventSeq) と一致しない",
            case.event_name
        );
    }
}

#[test]
fn dropping_event_seq_makes_the_envelope_undeserializable() {
    let mut raw = case_for(EVENT_TASK_DELETED);
    raw.as_object_mut().expect("object").remove("eventSeq");

    let result: Result<WatcherEnvelope<TaskDeletedPayload>, _> = serde_json::from_value(raw);

    assert!(
        result.is_err(),
        "eventSeq が欠けた envelope を許容すると gap 検知が無効化される"
    );
}

#[test]
fn dropping_cache_mutating_makes_the_envelope_undeserializable() {
    let mut raw = case_for(EVENT_TASK_DELETED);
    raw.as_object_mut().expect("object").remove("cacheMutating");

    let result: Result<WatcherEnvelope<TaskDeletedPayload>, _> = serde_json::from_value(raw);

    assert!(result.is_err());
}
