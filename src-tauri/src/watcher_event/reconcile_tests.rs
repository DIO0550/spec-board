//! 「watcher イベントを適用した resident state」が「同じ disk 状態で開き直した
//! state」と一致することを検証する統合テスト。
//!
//! `watcher_event/tests.rs` が空 config のセッションを手動 install するのに対し、
//! ここでは `open_project_impl` を通してコールドオープンし、外部編集を watcher
//! イベントとして流したあと、別の `AppState` で開き直した結果と全フィールド比較する。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tempfile::TempDir;

use super::handler::handle_batch;
use super::watcher_test_support::{removed_batch, rename_batch, upsert_batch};
use super::{AdapterContext, EmitFn};
use crate::config::{ConfigWriter, FsConfigWriter};
use crate::project::open_test_support::open_from_disk;
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo};

type EmitLog = Arc<Mutex<Vec<(String, Value)>>>;

/// frontmatter の parent / links を指定した task md を組み立てる。
fn task_md(title: &str, parent: Option<&str>, links: &[&str]) -> String {
    let mut markdown = format!("---\ntitle: {title}\nstatus: Todo\n");
    if let Some(parent) = parent {
        markdown.push_str(&format!("parent: {parent}\n"));
    }
    if !links.is_empty() {
        markdown.push_str("links:\n");
        for link in links {
            markdown.push_str(&format!("  - {link}\n"));
        }
    }
    markdown.push_str("---\n\nbody\n");
    markdown
}

fn write_md(root: &Path, rel: &str, body: &str) -> PathBuf {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }
    std::fs::write(&absolute, body).expect("write md");
    absolute
}

fn remove_md(root: &Path, rel: &str) -> PathBuf {
    let absolute = root.join(rel);
    std::fs::remove_file(&absolute).expect("remove md");
    absolute
}

/// disk を cold open し、その session に紐づく adapter context を返す。
fn open_with_adapter(root: &Path) -> (Arc<AppState>, AdapterContext, EmitLog) {
    let state = Arc::new(AppState::new());
    let snapshot = open_from_disk(&state, root);
    let identity = snapshot.identity();
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |event, payload| {
        log_clone
            .lock()
            .expect("emit log lock")
            .push((event.to_string(), payload));
    });
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state: Arc::clone(&state),
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
        config_writer: Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    };
    (state, ctx, log)
}

fn emitted_events(log: &EmitLog) -> Vec<String> {
    log.lock()
        .expect("emit log lock")
        .iter()
        .map(|(event, _)| event.clone())
        .collect()
}

/// resident state と「新しい `AppState` で開き直した結果」を全フィールド比較する。
///
/// 比較対象は reactivation の収束判定と同じ 5 つ。tasks は `HashMap` 同士の比較なので、
/// children / reverse_links / warnings の並びまで含めて一致していなければ落ちる。
fn assert_matches_reopen(state: &Arc<AppState>, root: &Path) {
    let resident = state
        .require_session_snapshot()
        .expect("project must be open");
    let fresh_state = Arc::new(AppState::new());
    let reopened = open_from_disk(&fresh_state, root);

    assert_eq!(resident.config(), reopened.config(), "config が一致する");
    assert_eq!(resident.labels(), reopened.labels(), "labels が一致する");
    assert_eq!(
        resident.milestones(),
        reopened.milestones(),
        "milestones が一致する"
    );
    assert_eq!(resident.tasks(), reopened.tasks(), "tasks が一致する");
    assert_eq!(
        resident.load_warnings(),
        reopened.load_warnings(),
        "load_warnings が一致する"
    );
}

#[test]
fn an_edit_that_affects_nobody_else_emits_a_single_task_updated() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, log) = open_with_adapter(dir.path());

    let edited = write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\n\nedited\n",
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_eq!(emitted_events(&log), vec!["task-updated".to_string()]);
    assert_matches_reopen(&state, dir.path());
}

#[test]
fn an_edit_that_moves_a_child_emits_only_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    write_md(dir.path(), "tasks/c.md", &task_md("C", None, &[]));
    let (_state, ctx, log) = open_with_adapter(dir.path());

    let edited = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/c.md"), &[]),
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_eq!(
        emitted_events(&log),
        vec!["watcher-resync-required".to_string()],
        "task-updated 単体では FE の children が追いつかない"
    );
}

#[test]
fn deleting_an_unreferenced_task_emits_a_single_task_deleted() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, log) = open_with_adapter(dir.path());

    let deleted = remove_md(dir.path(), "tasks/a.md");
    handle_batch(&removed_batch(deleted), &ctx);

    assert_eq!(emitted_events(&log), vec!["task-deleted".to_string()]);
    assert_matches_reopen(&state, dir.path());
}

#[test]
fn deleting_a_referenced_task_emits_only_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (_state, ctx, log) = open_with_adapter(dir.path());

    let deleted = remove_md(dir.path(), "tasks/a.md");
    handle_batch(&removed_batch(deleted), &ctx);

    assert_eq!(
        emitted_events(&log),
        vec!["watcher-resync-required".to_string()]
    );
}

#[test]
fn an_unknown_status_adds_a_column_and_still_converges() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    let (state, ctx, log) = open_with_adapter(dir.path());

    let edited = write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Backlog\n---\n\nbody\n",
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_eq!(
        emitted_events(&log),
        vec!["watcher-resync-required".to_string()],
        "新しいカラムを知らない FE には全量再取得を要求する"
    );
    let resident = state
        .require_session_snapshot()
        .expect("project must be open");
    assert!(
        resident
            .config()
            .columns
            .iter()
            .any(|column| column.name.as_str() == "Backlog"),
        "未知 status のカラムが追加される"
    );
    assert_matches_reopen(&state, dir.path());
}

#[test]
fn a_parent_chain_deeper_than_the_limit_keeps_the_cache_and_reports_a_diagnostic() {
    let dir = TempDir::new().expect("tempdir");
    // 上限ちょうどの chain（0 → 1 → … → 20）で開き、外部編集で 1 段だけ深くする。
    const DEEPEST: usize = 20;
    for index in 0..DEEPEST {
        write_md(
            dir.path(),
            &format!("tasks/{index}.md"),
            &task_md("T", Some(&format!("tasks/{}.md", index + 1)), &[]),
        );
    }
    write_md(
        dir.path(),
        &format!("tasks/{DEEPEST}.md"),
        &task_md("Leaf", None, &[]),
    );
    let (state, ctx, log) = open_with_adapter(dir.path());
    let before = state
        .require_session_snapshot()
        .expect("project must be open")
        .tasks()
        .clone();

    // 末尾に 1 段足すと親チェーンが上限を超える。
    write_md(
        dir.path(),
        &format!("tasks/{}.md", DEEPEST + 1),
        &task_md("Deeper", None, &[]),
    );
    let deepened = write_md(
        dir.path(),
        &format!("tasks/{DEEPEST}.md"),
        &task_md("Leaf", Some(&format!("tasks/{}.md", DEEPEST + 1)), &[]),
    );
    handle_batch(&upsert_batch(deepened), &ctx);

    assert_eq!(emitted_events(&log), vec!["watcher-diagnostic".to_string()]);
    assert_eq!(
        state
            .require_session_snapshot()
            .expect("project must be open")
            .tasks(),
        &before,
        "再構築に失敗したときは cache を触らない"
    );
}

#[test]
fn adding_a_link_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    write_md(dir.path(), "tasks/d.md", &task_md("D", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let edited = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", None, &["tasks/d.md"]),
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn creating_a_new_file_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let created = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    handle_batch(&upsert_batch(created), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn deleting_a_referenced_task_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", None, &["tasks/a.md"]),
    );
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let deleted = remove_md(dir.path(), "tasks/a.md");
    handle_batch(&removed_batch(deleted), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn a_rename_in_one_batch_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let from = dir.path().join("tasks/a.md");
    std::fs::rename(&from, dir.path().join("tasks/renamed.md")).expect("rename");
    let to = dir.path().join("tasks/renamed.md");
    handle_batch(&rename_batch(from, to), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn a_rename_split_into_two_batches_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    // deadline は path ごとに独立してスライドするため、rename と後続保存は別 batch で届く。
    let from = dir.path().join("tasks/a.md");
    std::fs::rename(&from, dir.path().join("tasks/renamed.md")).expect("rename");
    let to = dir.path().join("tasks/renamed.md");
    handle_batch(&rename_batch(from, to), &ctx);

    let saved = write_md(
        dir.path(),
        "tasks/renamed.md",
        &task_md("Renamed", Some("tasks/b.md"), &[]),
    );
    handle_batch(&upsert_batch(saved), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn creating_a_cycle_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let edited = write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", Some("tasks/a.md"), &[]),
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn breaking_a_cycle_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", Some("tasks/a.md"), &[]),
    );
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let edited = write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    handle_batch(&upsert_batch(edited), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn editing_an_unrelated_task_while_a_cycle_exists_keeps_the_cycle_warnings() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", Some("tasks/a.md"), &[]),
    );
    write_md(dir.path(), "tasks/c.md", &task_md("C", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    // 循環に無関係な task を触っても、disk に残っている循環の warning は消えない。
    let edited = write_md(
        dir.path(),
        "tasks/c.md",
        "---\ntitle: C\nstatus: Todo\n---\n\nedited\n",
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn deleting_an_unrelated_task_while_a_cycle_exists_keeps_the_cycle_warnings() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", Some("tasks/a.md"), &[]),
    );
    write_md(dir.path(), "tasks/c.md", &task_md("C", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let deleted = remove_md(dir.path(), "tasks/c.md");
    handle_batch(&removed_batch(deleted), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn breaking_the_frontmatter_of_a_cached_task_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let broken = write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: [unclosed\n---\n\nbody\n",
    );
    handle_batch(&upsert_batch(broken), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn repairing_a_broken_task_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: [unclosed\n---\n\nbody\n",
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let repaired = write_md(dir.path(), "tasks/a.md", &task_md("A", None, &[]));
    handle_batch(&upsert_batch(repaired), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn deleting_a_file_that_only_produced_a_load_warning_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: [unclosed\n---\n\nbody\n",
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let deleted = remove_md(dir.path(), "tasks/a.md");
    handle_batch(&removed_batch(deleted), &ctx);

    assert_matches_reopen(&state, dir.path());
}

#[test]
fn reparenting_a_task_converges_to_the_reopened_state() {
    let dir = TempDir::new().expect("tempdir");
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/b.md"), &[]),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", None, &[]));
    write_md(dir.path(), "tasks/c.md", &task_md("C", None, &[]));
    let (state, ctx, _log) = open_with_adapter(dir.path());

    let edited = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", Some("tasks/c.md"), &[]),
    );
    handle_batch(&upsert_batch(edited), &ctx);

    assert_matches_reopen(&state, dir.path());
}
