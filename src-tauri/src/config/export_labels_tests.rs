//! `export_labels_impl` のテスト。

use std::path::Path;

use tempfile::TempDir;

use super::{export_labels_impl, ExportLabelsArgs, ExportLabelsError};
use crate::config::{LabelDefinition, LabelRegistry};
use crate::state::AppState;

fn definition(name: &str) -> LabelDefinition {
    LabelDefinition {
        name: name.to_string(),
        description: None,
        group: None,
        color: None,
        updated: None,
    }
}

fn opened_state(root: &Path, registry: LabelRegistry) -> AppState {
    let state = AppState::new();
    state
        .test_set_project_root(Some(root.to_path_buf()))
        .expect("writable");
    state.test_replace_labels(Some(registry)).expect("writable");
    state
}

fn args(path: &str) -> ExportLabelsArgs {
    ExportLabelsArgs {
        path: path.to_string(),
    }
}

#[test]
fn writes_yaml_to_specified_path() {
    let tmp = TempDir::new().unwrap();
    let registry = LabelRegistry::try_new(vec![definition("bug"), definition("feat")])
        .expect("valid registry");
    let state = opened_state(tmp.path(), registry.clone());

    let target = tmp.path().join("exported.yml");
    let target_str = target.to_str().unwrap().to_string();

    export_labels_impl(&state, &args(&target_str)).expect("export ok");

    let written = std::fs::read_to_string(&target).expect("read written file");
    let expected = serde_yaml_ng::to_string(&registry).expect("serialize");
    // store と同一直列化経路で書かれるため、文字列が完全一致する。
    assert_eq!(written, expected);
}

#[test]
fn writes_empty_registry_as_empty_labels() {
    let tmp = TempDir::new().unwrap();
    let registry = LabelRegistry::default();
    let state = opened_state(tmp.path(), registry.clone());

    let target = tmp.path().join("empty.yml");
    let target_str = target.to_str().unwrap().to_string();

    export_labels_impl(&state, &args(&target_str)).expect("export ok");
    let written = std::fs::read_to_string(&target).expect("read written file");
    let expected = serde_yaml_ng::to_string(&registry).expect("serialize");
    assert_eq!(written, expected);
}

#[test]
fn empty_path_is_rejected() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());
    let err = export_labels_impl(&state, &args("")).expect_err("empty rejected");
    assert!(matches!(err, ExportLabelsError::EmptyPath));
}

#[test]
fn no_project_open_is_rejected() {
    let state = AppState::new();
    // project_path / labels 共に None のまま
    let err = export_labels_impl(&state, &args("/tmp/x.yml")).expect_err("no project");
    assert!(matches!(err, ExportLabelsError::NoProjectOpen));
}

#[test]
fn nonexistent_parent_directory_returns_write_error() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());
    let missing = tmp.path().join("no_such_dir/inside.yml");
    let missing_str = missing.to_str().unwrap().to_string();

    let err = export_labels_impl(&state, &args(&missing_str)).expect_err("write fails");
    assert!(matches!(err, ExportLabelsError::Write(_)));
}

#[test]
fn empty_path_check_runs_before_state_lookup() {
    // 未オープン + 空 path → EmptyPath が先に返る（空 path が NoProjectOpen より優先）。
    let state = AppState::new();
    let err = export_labels_impl(&state, &args("")).expect_err("empty rejected");
    assert!(matches!(err, ExportLabelsError::EmptyPath));
}

#[test]
fn whitespace_only_path_is_rejected() {
    // 空白のみの path は trim 後に空文字となるため EmptyPath で弾かれる。
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());
    let err = export_labels_impl(&state, &args("   \t  ")).expect_err("whitespace rejected");
    assert!(matches!(err, ExportLabelsError::EmptyPath));
}

#[test]
fn path_with_surrounding_whitespace_is_trimmed_before_write() {
    // 前後に空白を含むパスは trim 済みのパスへ書き込まれる。
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());
    let target = tmp.path().join("trimmed.yml");
    let padded = format!("  {}  ", target.to_str().unwrap());
    export_labels_impl(&state, &args(&padded)).expect("export ok");
    assert!(target.exists(), "trim 済みパスにファイルが作られる");
}
