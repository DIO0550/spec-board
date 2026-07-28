use super::*;

#[test]
fn from_raw_round_trips_through_as_u64() {
    for raw in [0_u64, 1, 42, u64::MAX] {
        assert_eq!(raw, ProjectGeneration::from_raw(raw).as_u64());
    }
}

#[test]
fn serializes_transparently_as_a_bare_number() {
    let json = serde_json::to_string(&ProjectGeneration::from_raw(3)).expect("serialize");

    assert_eq!("3", json);
}

#[test]
fn deserializes_transparently_from_a_bare_number() {
    let generation: ProjectGeneration = serde_json::from_str("7").expect("deserialize");

    assert_eq!(7, generation.as_u64());
}

#[test]
fn compares_in_numeric_order() {
    assert!(ProjectGeneration::from_raw(1) < ProjectGeneration::from_raw(2));
    assert_eq!(
        ProjectGeneration::from_raw(2),
        ProjectGeneration::from_raw(2)
    );
    assert!(ProjectGeneration::from_raw(3) > ProjectGeneration::from_raw(2));
}

#[test]
fn boundary_values_are_constructible_and_comparable() {
    let zero = ProjectGeneration::from_raw(0);
    let max = ProjectGeneration::from_raw(u64::MAX);

    assert!(zero < max);
    assert_eq!(0, zero.as_u64());
    assert_eq!(u64::MAX, max.as_u64());
}
