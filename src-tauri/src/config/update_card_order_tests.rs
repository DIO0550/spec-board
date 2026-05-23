use std::fs;
use std::path::Path;
use std::sync::Arc;

use tempfile::TempDir;

use super::update_card_order_impl;
use super::UpdateCardOrderError;
use crate::config::Config;
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::state::AppState;

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn open_with_noop(state: &Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(state, &intent, &NoopWatcherFactory).expect("open should succeed");
}

fn read_config_json(project_root: &Path) -> Config {
    let raw = fs::read_to_string(project_root.join(".spec-board").join("config.json"))
        .expect("config.json exists");
    serde_json::from_str(&raw).expect("config.json is valid")
}

fn write_md(root: &Path, rel: &str, content: &str) {
    let abs = root.join(rel);
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(abs, content).unwrap();
}

#[test]
fn overwrites_existing_card_order_entry() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    write_md(dir.path(), "tasks/a.md", "");
    write_md(dir.path(), "tasks/b.md", "");

    update_card_order_impl(
        &state,
        "Todo".to_string(),
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
    )
    .expect("update should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Todo"),
        Some(&vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()])
    );

    let in_state = state.config().unwrap().unwrap();
    assert_eq!(
        in_state.card_order.get("Todo"),
        Some(&vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()])
    );
}

#[test]
fn returns_unknown_column_when_column_missing() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let before = fs::read_to_string(dir.path().join(".spec-board").join("config.json")).ok();

    let err = update_card_order_impl(&state, "Ghost".to_string(), vec!["tasks/a.md".to_string()])
        .expect_err("unknown column should fail");

    assert!(
        matches!(
            &err,
            UpdateCardOrderError::UnknownColumn { column_name } if column_name == "Ghost"
        ),
        "unexpected error: {err:?}"
    );

    let after = fs::read_to_string(dir.path().join(".spec-board").join("config.json")).ok();
    assert_eq!(before, after, "config.json は不変であるべき");

    let in_state = state.config().unwrap().unwrap();
    assert!(!in_state.card_order.contains_key("Ghost"));
}

#[test]
fn saves_empty_array_when_file_paths_empty() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    update_card_order_impl(&state, "Todo".to_string(), vec![]).expect("empty save should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(on_disk.card_order.get("Todo"), Some(&Vec::<String>::new()));
}

#[test]
fn last_call_wins_on_consecutive_invocations() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    write_md(dir.path(), "tasks/a.md", "");
    write_md(dir.path(), "tasks/b.md", "");

    update_card_order_impl(
        &state,
        "Todo".to_string(),
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
    )
    .unwrap();
    update_card_order_impl(
        &state,
        "Todo".to_string(),
        vec!["tasks/b.md".to_string(), "tasks/a.md".to_string()],
    )
    .unwrap();

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Todo"),
        Some(&vec!["tasks/b.md".to_string(), "tasks/a.md".to_string()])
    );
}

#[test]
fn inserts_new_entry_when_column_not_in_card_order() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let initial = state.config().unwrap().unwrap();
    assert!(!initial.card_order.contains_key("In Progress"));

    write_md(dir.path(), "tasks/x.md", "");

    update_card_order_impl(
        &state,
        "In Progress".to_string(),
        vec!["tasks/x.md".to_string()],
    )
    .expect("insert should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("In Progress"),
        Some(&vec!["tasks/x.md".to_string()])
    );
}

#[test]
fn returns_no_project_open_when_state_empty() {
    let state = AppState::new();

    let err = update_card_order_impl(&state, "Todo".to_string(), vec!["tasks/a.md".to_string()])
        .expect_err("no project open should fail");

    assert!(matches!(err, UpdateCardOrderError::NoProjectOpen));
}

#[cfg(unix)]
#[test]
fn state_config_remains_unchanged_when_disk_write_fails() {
    use std::os::unix::fs::symlink;

    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    let before = state.config().unwrap().unwrap();

    let outside = tempdir();
    let target = outside.path().join("external.json");
    fs::write(&target, "keep").unwrap();
    let config_path = dir.path().join(".spec-board").join("config.json");
    // open_project_impl はデフォルト config を読み込むのみで config.json を書き出さないため、
    // 既存ファイルがあれば消してから symlink を貼る。
    let _ = fs::remove_file(&config_path);
    symlink(&target, &config_path).unwrap();

    let err = update_card_order_impl(&state, "Todo".to_string(), vec!["tasks/a.md".to_string()])
        .expect_err("disk write should fail");

    assert!(
        matches!(err, UpdateCardOrderError::ConfigIo(_)),
        "unexpected error: {err:?}"
    );

    let after = state.config().unwrap().unwrap();
    assert_eq!(
        before.card_order, after.card_order,
        "disk 失敗時に in-memory が先行更新されてはならない"
    );

    assert_eq!(fs::read_to_string(&target).unwrap(), "keep");
}

#[test]
fn cleans_up_when_all_paths_exist() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    write_md(dir.path(), "tasks/a.md", "");
    write_md(dir.path(), "tasks/b.md", "");

    update_card_order_impl(
        &state,
        "Todo".to_string(),
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
    )
    .expect("update should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Todo"),
        Some(&vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()])
    );
}

#[test]
fn cleans_up_to_empty_when_all_paths_missing() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    update_card_order_impl(
        &state,
        "Todo".to_string(),
        vec![
            "tasks/missing-1.md".to_string(),
            "tasks/missing-2.md".to_string(),
        ],
    )
    .expect("update should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(on_disk.card_order.get("Todo"), Some(&Vec::<String>::new()));
}

#[test]
fn cleans_up_only_missing_paths_in_mixed_input() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    write_md(dir.path(), "tasks/exists-1.md", "");
    write_md(dir.path(), "tasks/exists-2.md", "");

    update_card_order_impl(
        &state,
        "Todo".to_string(),
        vec![
            "tasks/exists-1.md".to_string(),
            "tasks/missing.md".to_string(),
            "tasks/exists-2.md".to_string(),
        ],
    )
    .expect("update should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.card_order.get("Todo"),
        Some(&vec![
            "tasks/exists-1.md".to_string(),
            "tasks/exists-2.md".to_string()
        ])
    );
}

#[test]
fn cleans_up_empty_input_to_empty() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(&state, dir.path());

    update_card_order_impl(&state, "Todo".to_string(), vec![]).expect("empty input should succeed");

    let on_disk = read_config_json(dir.path());
    assert_eq!(on_disk.card_order.get("Todo"), Some(&Vec::<String>::new()));
}

#[cfg(unix)]
#[test]
fn keeps_path_when_metadata_returns_non_notfound_error() {
    let dir = tempdir();

    // NUL バイトを含む相対パスは fs::metadata で ErrorKind::InvalidInput を返す
    // （非 NotFound）。保守的に保持されることを確認する。
    let nul_path = "tasks/with\0nul.md".to_string();
    let input = vec![nul_path.clone()];

    let result = super::cleanup_missing_paths(dir.path(), input);

    assert_eq!(result, vec![nul_path]);
}
