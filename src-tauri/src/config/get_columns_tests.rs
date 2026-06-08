use std::collections::BTreeMap;

use super::{get_columns_impl, GetColumnsError, GetColumnsPayload};
use crate::config::column_name::ColumnName;
use crate::config::{Column, Config};
use crate::state::{AppState, AppStateError};

fn column(name: &str, order: u32) -> Column {
    Column {
        name: ColumnName::from(name),
        order,
        color: None,
    }
}

fn make_config(columns: Vec<Column>, done_column: Option<ColumnName>) -> Config {
    Config {
        version: 1,
        columns,
        card_order: BTreeMap::new(),
        done_column,
    }
}

#[test]
fn returns_err_when_no_project_open() {
    let state = AppState::new();
    let err = get_columns_impl(&state).expect_err("config 未注入時は Err");
    assert_eq!(err, GetColumnsError::NoProjectOpen);
}

#[test]
fn returns_columns_with_explicit_done_column() {
    let state = AppState::new();
    let cfg = make_config(
        vec![column("Todo", 0), column("Doing", 1), column("Done", 2)],
        Some(ColumnName::from("Done")),
    );
    state.replace_config(Some(cfg)).expect("writable");

    let payload = get_columns_impl(&state).expect("正常系");
    assert_eq!(
        payload,
        GetColumnsPayload {
            columns: vec![column("Todo", 0), column("Doing", 1), column("Done", 2)],
            done_column: "Done".to_string(),
        }
    );
}

#[test]
fn returns_columns_sorted_by_order() {
    let state = AppState::new();
    let cfg = make_config(
        vec![column("Done", 2), column("Todo", 0), column("Doing", 1)],
        Some(ColumnName::from("Done")),
    );
    state.replace_config(Some(cfg)).expect("writable");

    let payload = get_columns_impl(&state).expect("正常系");
    let names: Vec<String> = payload.columns.iter().map(|c| c.name.to_string()).collect();
    assert_eq!(names, vec!["Todo", "Doing", "Done"]);
}

#[test]
fn falls_back_to_order_max_column_when_done_column_is_none() {
    let state = AppState::new();
    // 入力順を崩し、配列末尾 != order 最大としておくことで
    // 実装が誤って `columns.last()` を返すと検出できる。
    let cfg = make_config(
        vec![column("Archive", 5), column("Todo", 0), column("Doing", 1)],
        None,
    );
    state.replace_config(Some(cfg)).expect("writable");

    let payload = get_columns_impl(&state).expect("正常系");
    assert_eq!(payload.done_column, "Archive");
}

#[test]
fn state_lock_poisoned_display_matches_contract() {
    assert_eq!(
        GetColumnsError::StateLockPoisoned.to_string(),
        "内部状態のロックが破損しました"
    );
    assert_eq!(
        GetColumnsError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    let err: GetColumnsError = AppStateError::LockPoisoned.into();
    assert_eq!(err, GetColumnsError::StateLockPoisoned);
}

#[test]
#[should_panic(expected = "config invariant violation: columns must be non-empty")]
fn panics_when_columns_empty_even_if_done_column_is_some() {
    let state = AppState::new();
    // columns: [] かつ done_column: Some(_) では `resolved_done_column()` が
    // `Some` を返してしまうため、空 columns チェックは `assert!` で独立に行う
    // 必要がある。本テストはその不変条件防御の回帰を防ぐ。
    let cfg = make_config(vec![], Some(ColumnName::from("Done")));
    state.replace_config(Some(cfg)).expect("writable");

    let _ = get_columns_impl(&state);
}
