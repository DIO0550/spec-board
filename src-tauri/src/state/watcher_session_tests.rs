use super::*;

use std::path::PathBuf;

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
