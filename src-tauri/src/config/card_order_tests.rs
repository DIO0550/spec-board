use std::collections::BTreeMap;

use super::CardOrder;
use crate::config::column_name::ColumnName;

/// 指定カラムの並びを `&str` の Vec として取り出す。キーが無ければ空 Vec。
fn column_of<'a>(card_order: &'a CardOrder, column: &str) -> Vec<&'a str> {
    card_order
        .get(column)
        .map(|paths| paths.iter().map(|path| path.as_str()).collect())
        .unwrap_or_default()
}

/// canonical 化済みの `CardOrder` を、再構築の入力にできる生の map へ戻す。
fn as_raw_map(card_order: &CardOrder) -> BTreeMap<String, Vec<String>> {
    card_order
        .iter()
        .map(|(column, paths)| {
            (
                column.as_str().to_string(),
                paths.iter().map(|path| path.as_str().to_string()).collect(),
            )
        })
        .collect()
}

fn raw_map(entries: &[(&str, &[&str])]) -> BTreeMap<String, Vec<String>> {
    entries
        .iter()
        .map(|(column, paths)| {
            (
                (*column).to_string(),
                paths.iter().map(|path| (*path).to_string()).collect(),
            )
        })
        .collect()
}

#[test]
fn canonical_path_keeps_plain_relative_path() {
    let canonical = CardOrder::canonical_path("tasks/a.md").unwrap();
    assert_eq!(canonical.as_str(), "tasks/a.md");
}

#[test]
fn from_raw_map_preserves_input_order() {
    let card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/b.md", "tasks/a.md"])]));

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/b.md", "tasks/a.md"]);
}

#[test]
fn from_raw_map_keeps_first_occurrence_of_duplicated_path() {
    let card_order = CardOrder::from_raw_map(raw_map(&[(
        "Todo",
        &["tasks/a.md", "tasks/b.md", "tasks/a.md"],
    )]));

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md", "tasks/b.md"]);
}

#[test]
fn canonical_path_normalizes_notation_variants() {
    let cases = [
        ("tasks\\a.md", "tasks/a.md"),
        ("./tasks/a.md", "tasks/a.md"),
        ("tasks//a.md", "tasks/a.md"),
        ("C:/tasks/a.md", "tasks/a.md"),
        ("/tasks/a.md", "tasks/a.md"),
        ("tasks/./a.md", "tasks/a.md"),
        (".\\tasks\\a.md", "tasks/a.md"),
    ];

    for (raw, expected) in cases {
        let canonical = CardOrder::canonical_path(raw);
        assert_eq!(
            canonical.as_ref().map(|path| path.as_str()),
            Some(expected),
            "canonical_path({raw}) should be {expected}"
        );
    }
}

#[test]
fn from_raw_map_treats_notation_variants_as_same_path() {
    let card_order = CardOrder::from_raw_map(raw_map(&[(
        "Todo",
        &["tasks/a.md", "tasks\\a.md", "./tasks/a.md", "C:/tasks/a.md"],
    )]));

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md"]);
}

#[test]
fn from_raw_map_keeps_case_variants_as_distinct_paths() {
    let card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md", "Tasks/A.md"])]));

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md", "Tasks/A.md"]);
}

#[test]
fn canonical_path_rejects_non_task_references() {
    let cases = [
        "",
        "   ",
        "notes.txt",
        "../outside.md",
        "tasks/../a.md",
        ".",
    ];

    for raw in cases {
        assert_eq!(
            CardOrder::canonical_path(raw),
            None,
            "canonical_path({raw}) should be rejected"
        );
    }
}

#[test]
fn from_raw_map_drops_references_that_cannot_be_canonicalized() {
    let card_order = CardOrder::from_raw_map(raw_map(&[(
        "Todo",
        &["", "notes.txt", "../outside.md", "tasks/a.md"],
    )]));

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md"]);
}

#[test]
fn canonical_path_is_idempotent() {
    let cases = [
        "tasks\\a.md",
        "./tasks//a.md",
        "C:/tasks/a.md",
        "tasks/a.md",
    ];

    for raw in cases {
        let once = CardOrder::canonical_path(raw).unwrap();
        let twice = CardOrder::canonical_path(once.as_str()).unwrap();
        assert_eq!(once, twice, "canonical_path({raw}) should be idempotent");
    }
}

#[test]
fn from_raw_map_is_idempotent() {
    let raw = raw_map(&[
        (
            "Todo",
            &["tasks\\a.md", "tasks/a.md", "notes.txt", "tasks/b.md"],
        ),
        ("Done", &["./tasks/c.md", "../outside.md"]),
    ]);

    let once = CardOrder::from_raw_map(raw);
    let twice = CardOrder::from_raw_map(as_raw_map(&once));

    assert_eq!(once, twice);
}

#[test]
fn get_returns_none_for_unknown_column() {
    let card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md"])]));

    assert!(card_order.get("Ghost").is_none());
    assert_eq!(card_order.get("Todo").map(Vec::len), Some(1));
}

#[test]
fn keys_and_iter_walk_columns_in_key_order() {
    let card_order = CardOrder::from_raw_map(raw_map(&[
        ("Todo", &["tasks/a.md"]),
        ("Done", &["tasks/b.md"]),
        ("In Progress", &[]),
    ]));

    let keys: Vec<&str> = card_order.keys().map(ColumnName::as_str).collect();
    assert_eq!(keys, ["Done", "In Progress", "Todo"]);

    let iterated: Vec<&str> = card_order.iter().map(|(key, _)| key.as_str()).collect();
    assert_eq!(iterated, keys);
}

#[test]
fn is_empty_reports_whether_any_column_exists() {
    assert!(CardOrder::new().is_empty());
    assert!(!CardOrder::from_raw_map(raw_map(&[("Todo", &[])])).is_empty());
}

#[test]
fn contains_path_absorbs_notation_variants() {
    let card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md"])]));

    assert!(card_order.contains_path("Todo", "tasks/a.md"));
    assert!(card_order.contains_path("Todo", "tasks\\a.md"));
    assert!(card_order.contains_path("Todo", "./tasks/a.md"));
    assert!(!card_order.contains_path("Todo", "Tasks/A.md"));
    assert!(!card_order.contains_path("Todo", "tasks/b.md"));
    assert!(!card_order.contains_path("Ghost", "tasks/a.md"));
    assert!(!card_order.contains_path("Todo", "../outside.md"));
}

#[test]
fn set_column_replaces_existing_order() {
    let mut card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md"])]));

    card_order.set_column("Todo", &["tasks/b.md", "tasks/c.md"]);

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/b.md", "tasks/c.md"]);
}

#[test]
fn set_column_canonicalizes_and_dedupes() {
    let mut card_order = CardOrder::new();

    card_order.set_column(
        "Todo",
        &["tasks\\a.md", "tasks/a.md", "notes.txt", "./tasks/b.md"],
    );

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md", "tasks/b.md"]);
}

#[test]
fn append_to_column_adds_to_the_end() {
    let mut card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md"])]));

    card_order.append_to_column("Todo", &["tasks/b.md"]);

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md", "tasks/b.md"]);
}

#[test]
fn append_to_column_drops_references_that_cannot_be_canonicalized() {
    let mut card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md"])]));

    card_order.append_to_column("Todo", &["notes.txt", "../outside.md", "", "tasks/b.md"]);

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md", "tasks/b.md"]);
}

#[test]
fn append_to_column_creates_missing_column() {
    let mut card_order = CardOrder::new();

    card_order.append_to_column("Todo", &["tasks/a.md"]);

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md"]);
}

#[test]
fn append_to_column_skips_paths_already_present() {
    let mut card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &["tasks/a.md"])]));

    card_order.append_to_column("Todo", &["tasks\\a.md", "tasks/b.md", "tasks/b.md"]);

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md", "tasks/b.md"]);
}

#[test]
fn serializes_to_the_same_json_shape_as_a_plain_map() {
    let card_order = CardOrder::from_raw_map(raw_map(&[
        ("Todo", &["tasks/a.md"]),
        ("Done", &["tasks/b.md", "tasks/c.md"]),
    ]));

    assert_eq!(
        serde_json::to_string(&card_order).unwrap(),
        r#"{"Done":["tasks/b.md","tasks/c.md"],"Todo":["tasks/a.md"]}"#
    );
}

#[test]
fn deserializes_through_canonicalization() {
    let card_order: CardOrder =
        serde_json::from_str(r#"{"Todo":["tasks\\a.md","tasks/a.md","notes.txt"]}"#).unwrap();

    assert_eq!(column_of(&card_order, "Todo"), ["tasks/a.md"]);
}

#[test]
fn from_raw_map_keeps_column_with_empty_paths() {
    let card_order = CardOrder::from_raw_map(raw_map(&[("Todo", &[])]));

    assert!(card_order.get("Todo").is_some());
    assert_eq!(column_of(&card_order, "Todo"), Vec::<&str>::new());
}
