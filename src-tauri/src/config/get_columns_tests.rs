use super::{get_columns_impl, GetColumnsError};
use crate::state::AppState;

#[test]
fn returns_err_when_no_project_open() {
    let state = AppState::new();
    let err = get_columns_impl(&state).expect_err("config 未注入時は Err");
    assert_eq!(err, GetColumnsError::NoProjectOpen);
}
