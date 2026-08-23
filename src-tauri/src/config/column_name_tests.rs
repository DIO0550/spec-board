use super::{ColumnName, ColumnNameError};
use std::collections::{BTreeMap, HashMap};

#[test]
fn try_from_str_rejects_empty() {
    assert_eq!(ColumnName::try_from_str(""), Err(ColumnNameError::Empty));
}

#[test]
fn try_from_str_accepts_non_empty() {
    let name = ColumnName::try_from_str("Todo").unwrap();
    assert_eq!(name.as_str(), "Todo");
    assert!(name.is_validated());
}

#[test]
fn try_from_str_accepts_whitespace_without_normalizing_it() {
    for raw in [" ", "  Todo  "] {
        let name = ColumnName::try_from_str(raw).unwrap();
        assert_eq!(name.as_str().as_bytes(), raw.as_bytes());
        assert!(name.is_validated());
    }
}

#[test]
fn from_lenient_accepts_empty() {
    let name = ColumnName::from_lenient("");
    assert!(name.is_empty());
    assert!(!name.is_validated());
}

#[test]
fn from_lenient_accepts_whitespace_only() {
    let name = ColumnName::from_lenient("  ");
    assert_eq!(name.as_str(), "  ");
    assert!(!name.is_validated());
}

#[test]
fn from_conversions_keep_non_empty_values_lenient() {
    let from_str = ColumnName::from("Todo");
    let from_string = ColumnName::from("Done".to_string());

    assert!(!from_str.is_validated());
    assert!(!from_string.is_validated());
}

#[test]
fn validation_state_does_not_change_value_identity_or_representations() {
    use std::hash::{DefaultHasher, Hash, Hasher};

    let lenient = ColumnName::from_lenient("Todo");
    let validated = ColumnName::try_from_str("Todo").unwrap();
    let mut lenient_hasher = DefaultHasher::new();
    let mut validated_hasher = DefaultHasher::new();
    lenient.hash(&mut lenient_hasher);
    validated.hash(&mut validated_hasher);

    assert_eq!(lenient, validated);
    assert_eq!(lenient.cmp(&validated), std::cmp::Ordering::Equal);
    assert_eq!(lenient_hasher.finish(), validated_hasher.finish());
    assert_eq!(format!("{lenient}"), format!("{validated}"));
    assert_eq!(format!("{lenient:?}"), format!("{validated:?}"));
    assert_eq!(format!("{validated:?}"), "ColumnName(\"Todo\")");
    assert_eq!(
        serde_json::to_string(&lenient).unwrap(),
        serde_json::to_string(&validated).unwrap()
    );
}

#[test]
fn ord_matches_string_lexical_order() {
    let a = ColumnName::from_lenient("Apple");
    let b = ColumnName::from_lenient("Banana");
    assert!(a < b);
}

#[test]
fn hashmap_key_compatibility() {
    let mut map: HashMap<ColumnName, u32> = HashMap::new();
    map.insert(ColumnName::try_from_str("Todo").unwrap(), 42);
    assert_eq!(map.get(&ColumnName::from_lenient("Todo")), Some(&42));
    assert_eq!(map.get("Todo"), Some(&42));
}

#[test]
fn btreemap_key_compatibility() {
    let mut map: BTreeMap<ColumnName, u32> = BTreeMap::new();
    map.insert(ColumnName::from_lenient("Todo"), 1);
    map.insert(ColumnName::from_lenient("Done"), 2);
    assert_eq!(
        map.get(&ColumnName::try_from_str("Todo").unwrap()),
        Some(&1)
    );
    assert_eq!(map.get("Todo"), Some(&1));
    let keys: Vec<_> = map.keys().map(ColumnName::as_str).collect();
    assert_eq!(keys, vec!["Done", "Todo"]);
}

#[test]
fn serde_round_trip() {
    let name = ColumnName::try_from_str("Todo").unwrap();
    let serialized = serde_json::to_string(&name).unwrap();
    assert_eq!(serialized, "\"Todo\"");
    let restored: ColumnName = serde_json::from_str(&serialized).unwrap();
    assert_eq!(restored, name);
    assert!(!restored.is_validated());
}

#[test]
fn serde_deserialize_uses_lenient() {
    let restored: ColumnName = serde_json::from_str("\"\"").unwrap();
    assert!(restored.is_empty());
    assert!(!restored.is_validated());
}
