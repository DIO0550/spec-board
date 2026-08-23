use super::*;

use std::path::PathBuf;

use crate::config::{Config, LabelRegistry, MilestoneRegistry};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{PreparedProjectSession, SessionId};

fn sample_session() -> WatcherSession {
    WatcherSession {
        project_key: ProjectKey::from_root(&PathBuf::from("/home/user/specs")),
        generation: ProjectGeneration::from_raw(3),
        revision: TasksRevision::from_raw(42),
        event_seq: EventSeq::from_raw(17),
    }
}

#[test]
fn serializes_four_camel_case_keys() {
    let json = serde_json::to_value(sample_session()).expect("serialize");

    let object = json.as_object().expect("session must be a JSON object");
    let mut keys: Vec<&String> = object.keys().collect();
    keys.sort();
    assert_eq!(
        vec!["eventSeq", "generation", "projectKey", "revision"],
        keys
    );
}

#[test]
fn inner_value_objects_serialize_transparently() {
    let json = serde_json::to_value(sample_session()).expect("serialize");

    assert_eq!("/home/user/specs", json["projectKey"]);
    assert_eq!(3, json["generation"]);
    assert_eq!(42, json["revision"]);
    assert_eq!(17, json["eventSeq"]);
}

#[test]
fn coherent_snapshot_converts_to_existing_wire_shape() {
    let root = ProjectRoot::try_from_str("/home/user/specs").expect("valid root");
    let snapshot = PreparedProjectSession::new(
        root,
        Config::default(),
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        crate::task::task_index::ResolvedTaskSet::default(),
    )
    .into_session(SessionId::from_raw(9))
    .snapshot();

    let session = WatcherSession::from_snapshot(&snapshot, EventSeq::from_raw(17));

    assert_eq!("/home/user/specs", session.project_key.as_str());
    assert_eq!(9, session.generation.as_u64());
    assert_eq!(0, session.revision.as_u64());
    assert_eq!(17, session.event_seq.as_u64());
}

#[test]
fn idle_session_uses_empty_project_and_zero_counters() {
    let session = WatcherSession::idle();

    assert_eq!("", session.project_key.as_str());
    assert_eq!(0, session.generation.as_u64());
    assert_eq!(0, session.revision.as_u64());
    assert_eq!(0, session.event_seq.as_u64());
}
