//! `MoveTaskArgs::into_intent` の引数変換テスト。
//!
//! パス正規化の網羅（絶対 / 相対 / `.` / 拡張子）は `update/args_tests.rs` が
//! 共通 VO 側で担っているため、ここでは `expected_to_column_order` が同じ VO を
//! 通ることだけを固定する。

use std::path::Path;

use super::MoveTaskArgs;
use crate::task::move_task::error::MoveTaskCommandError;

fn raw_args(expected: &[&str]) -> MoveTaskArgs {
    MoveTaskArgs {
        file_path: "tasks/a.md".to_string(),
        from_column: "Todo".to_string(),
        to_column: "Done".to_string(),
        to_column_file_paths: vec!["tasks/a.md".to_string()],
        expected_to_column_order: expected.iter().map(|s| s.to_string()).collect(),
    }
}

#[test]
fn expected_to_column_order_paths_are_normalized() {
    let root = Path::new("/project");

    let intent = raw_args(&["./tasks/b.md", "/project/tasks/c.md"])
        .into_intent(root)
        .expect("ok");

    assert_eq!(
        vec!["tasks/b.md", "tasks/c.md"],
        intent.expected_to_column_order
    );
}

#[test]
fn parent_dir_segment_in_expected_order_is_rejected() {
    let root = Path::new("/project");

    let err = raw_args(&["../outside.md"])
        .into_intent(root)
        .expect_err("`..` を含む期待値は拒否されるべき");

    assert!(matches!(err, MoveTaskCommandError::InvalidPath(_)));
}

#[test]
fn one_unresolvable_expected_path_rejects_the_whole_move() {
    let root = Path::new("/project");

    let err = raw_args(&["tasks/b.md", "/elsewhere/outside.md"])
        .into_intent(root)
        .expect_err("解決できない期待値が 1 件でもあれば全体を拒否するべき");

    assert!(matches!(err, MoveTaskCommandError::InvalidPath(_)));
}
