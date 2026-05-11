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
}

#[test]
fn from_lenient_accepts_empty() {
    let name = ColumnName::from_lenient("");
    assert!(name.is_empty());
}

#[test]
fn from_lenient_accepts_whitespace_only() {
    let name = ColumnName::from_lenient("  ");
    assert_eq!(name.as_str(), "  ");
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
    let key = ColumnName::try_from_str("Todo").unwrap();
    map.insert(key.clone(), 42);
    assert_eq!(map.get(&key), Some(&42));
}

#[test]
fn btreemap_key_compatibility() {
    let mut map: BTreeMap<ColumnName, u32> = BTreeMap::new();
    map.insert(ColumnName::from_lenient("Todo"), 1);
    map.insert(ColumnName::from_lenient("Done"), 2);
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
}

#[test]
fn serde_deserialize_uses_lenient() {
    let restored: ColumnName = serde_json::from_str("\"\"").unwrap();
    assert!(restored.is_empty());
}
