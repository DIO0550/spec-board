use std::collections::BTreeMap;

use super::{get_columns_impl, GetColumnsError, GetColumnsPayload};
use crate::config::column_name::ColumnName;
use crate::config::{Column, Config};
use crate::state::AppState;

fn column(name: &str, order: u32) -> Column {
    Column {
        name: ColumnName::from(name),
        order,
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
