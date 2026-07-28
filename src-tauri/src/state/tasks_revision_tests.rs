use super::*;

#[test]
fn from_raw_round_trips_through_as_u64() {
    for raw in [0_u64, 1, 42, u64::MAX] {
        assert_eq!(raw, TasksRevision::from_raw(raw).as_u64());
    }
}

#[test]
fn serializes_transparently_as_a_bare_number() {
    let json = serde_json::to_string(&TasksRevision::from_raw(42)).expect("serialize");

    assert_eq!("42", json);
}

#[test]
fn deserializes_transparently_from_a_bare_number() {
    let revision: TasksRevision = serde_json::from_str("42").expect("deserialize");

    assert_eq!(42, revision.as_u64());
}

#[test]
fn compares_in_numeric_order() {
    assert!(TasksRevision::from_raw(41) < TasksRevision::from_raw(42));
    assert_eq!(TasksRevision::from_raw(42), TasksRevision::from_raw(42));
    assert!(TasksRevision::from_raw(43) > TasksRevision::from_raw(42));
}

#[test]
fn boundary_values_are_constructible_and_comparable() {
    let zero = TasksRevision::from_raw(0);
    let max = TasksRevision::from_raw(u64::MAX);

    assert!(zero < max);
    assert_eq!(0, zero.as_u64());
    assert_eq!(u64::MAX, max.as_u64());
}
