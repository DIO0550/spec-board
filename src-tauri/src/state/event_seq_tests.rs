use super::*;

#[test]
fn from_raw_round_trips_through_as_u64() {
    for raw in [0_u64, 1, 17, u64::MAX] {
        assert_eq!(raw, EventSeq::from_raw(raw).as_u64());
    }
}

#[test]
fn serializes_transparently_as_a_bare_number() {
    let json = serde_json::to_string(&EventSeq::from_raw(17)).expect("serialize");

    assert_eq!("17", json);
}

#[test]
fn deserializes_transparently_from_a_bare_number() {
    let seq: EventSeq = serde_json::from_str("17").expect("deserialize");

    assert_eq!(17, seq.as_u64());
}

#[test]
fn consecutive_numbers_compare_in_order() {
    let current = EventSeq::from_raw(17);
    let next = EventSeq::from_raw(18);

    assert!(current < next, "gap 判定は数値順の比較に依存する");
}

#[test]
fn boundary_values_are_constructible_and_comparable() {
    let zero = EventSeq::from_raw(0);
    let max = EventSeq::from_raw(u64::MAX);

    assert!(zero < max);
    assert_eq!(0, zero.as_u64());
    assert_eq!(u64::MAX, max.as_u64());
}
