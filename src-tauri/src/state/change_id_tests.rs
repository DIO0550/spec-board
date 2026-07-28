use super::*;

#[test]
fn compose_joins_generation_and_event_seq_with_a_hyphen() {
    let id = ChangeId::compose(ProjectGeneration::from_raw(3), EventSeq::from_raw(17));

    assert_eq!("3-17", id.as_str());
}

#[test]
fn differing_generation_yields_a_different_id() {
    let left = ChangeId::compose(ProjectGeneration::from_raw(3), EventSeq::from_raw(17));
    let right = ChangeId::compose(ProjectGeneration::from_raw(4), EventSeq::from_raw(17));

    assert_ne!(left, right);
}

#[test]
fn differing_event_seq_yields_a_different_id() {
    let left = ChangeId::compose(ProjectGeneration::from_raw(3), EventSeq::from_raw(17));
    let right = ChangeId::compose(ProjectGeneration::from_raw(3), EventSeq::from_raw(18));

    assert_ne!(left, right);
}

#[test]
fn serializes_transparently_as_a_bare_string() {
    let id = ChangeId::compose(ProjectGeneration::from_raw(3), EventSeq::from_raw(17));

    let json = serde_json::to_string(&id).expect("serialize");

    assert_eq!("\"3-17\"", json);
}

#[test]
fn boundary_values_compose_without_panicking() {
    let id = ChangeId::compose(
        ProjectGeneration::from_raw(u64::MAX),
        EventSeq::from_raw(u64::MAX),
    );

    assert_eq!(format!("{}-{}", u64::MAX, u64::MAX), id.as_str());
}
