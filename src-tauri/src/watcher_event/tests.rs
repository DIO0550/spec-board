//! `watcher_event::handler` の純粋ハンドラに対する単体テスト。
//!
//! emit を `Vec<(String, serde_json::Value)>` push スタブに差し替え、
//! `Watcher` を起動せずに `handle_change` / `handle_batch` を直接駆動する。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tempfile::TempDir;

use super::handler::{handle_batch, handle_change, run_event_loop, TaskFileChange};
use super::watcher_test_support::{rename_batch, upsert_batch};
use super::{AdapterContext, EmitFn};
use crate::config::{ConfigWriter, FsConfigWriter};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{PreparedProjectSession, SessionIdentity};
use crate::state::active_project_resources::{
    pending_activation_state, StagedProjectResources, WatcherActivation,
};
use crate::state::{AppState, BoxedWatcherHandle, SessionResourceAccess};
use crate::task::io::{FsTaskIo, TaskIo};
use spec_board_fs::watcher::file_change_batch::FileChangeBatch;
use spec_board_fs::watcher::handle::NoopWatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;
use std::thread;

type EmitLog = Arc<Mutex<Vec<(String, Value)>>>;

fn install_active_session(state: &AppState, root: &Path) -> SessionIdentity {
    let session_id = state.reserve_session_id().expect("reserve session ID");
    let candidate = PreparedProjectSession::new(
        ProjectRoot::from_path_buf(root.to_path_buf()).expect("valid project root"),
        Default::default(),
        Default::default(),
        Default::default(),
        crate::task::task_index::ResolvedTaskSet::default(),
    )
    .into_session(session_id);
    let identity = candidate.identity();
    let staged = StagedProjectResources::new(
        identity.clone(),
        Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
        WatcherActivation::new(pending_activation_state(), thread::current()),
        Arc::new(WriteIgnoreRegistry::new()),
    );
    state
        .swap_open(candidate, staged)
        .expect("install active test session");
    identity
}

fn active_resources(state: &AppState) -> SessionResourceAccess {
    let snapshot = state.require_session_snapshot().expect("active session");
    state
        .resources_for(snapshot.version())
        .expect("matching active resources")
}

fn replace_parsed_tasks(state: &AppState, tasks: Vec<crate::task::task_index::ParsedTask>) {
    let tasks = crate::task::task_index::ResolvedTaskSet::resolve_lenient(tasks)
        .expect("fixture candidates should resolve");
    let snapshot = state.require_session_snapshot().expect("active session");
    state
        .commit_session_write(&snapshot.identity(), move |session| {
            session.replace_tasks(tasks);
        })
        .expect("replace test tasks");
}

fn build_ctx(root: PathBuf, state: Arc<AppState>) -> (AdapterContext, EmitLog) {
    let identity = install_active_session(&state, &root);
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |ev, payload| {
        log_clone.lock().unwrap().push((ev.to_string(), payload));
    });
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state,
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
        config_writer: Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    };
    (ctx, log)
}

fn task_md(title: &str) -> String {
    format!("---\ntitle: {title}\nstatus: Todo\n---\n\nbody\n")
}

fn write_md(root: &Path, rel: &str, body: &str) -> PathBuf {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }
    std::fs::write(&absolute, body).expect("write md");
    absolute
}

fn snapshot_paths(state: &AppState) -> Vec<String> {
    let mut paths: Vec<String> = state
        .test_tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|t| t.file_path().as_str().to_owned())
        .collect();
    paths.sort();
    paths
}

fn drain_log(log: &EmitLog) -> Vec<(String, Value)> {
    log.lock().unwrap().drain(..).collect()
}

#[test]
fn create_event_for_new_path_emits_task_created_and_caches_task() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("handler should succeed");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one emit expected");
    assert_eq!("task-created", entries[0].0);
    assert_eq!("tasks/a.md", entries[0].1["payload"]["task"]["filePath"]);

    assert_eq!(vec!["tasks/a.md".to_string()], snapshot_paths(&state));
}

#[test]
fn modify_event_for_existing_path_emits_task_updated_and_replaces_cache_entry() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    // 事前に Created で投入する。
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    // 内容を更新して Modified を投入。
    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("modify ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-updated", entries[0].0);
    assert_eq!("A2", entries[0].1["payload"]["task"]["title"]);

    let tasks = state.test_tasks_snapshot().expect("readable");
    assert_eq!(1, tasks.len());
    assert_eq!("A2", tasks[0].title());
}

#[test]
fn create_event_for_already_cached_path_emits_task_updated_for_atomic_save() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    // atomic save では rename 後の to-side が Created で再通知されることがある。
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("create-on-existing");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-updated", entries[0].0);
}

#[test]
fn rename_event_emits_deleted_for_from_and_created_for_to() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let from_abs = write_md(dir.path(), "tasks/from.md", &task_md("F"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(from_abs.clone()), &ctx).expect("seed");
    drain_log(&log);

    // ファイルを物理的に rename してから rename 相当の batch を投入する。
    let to_abs = dir.path().join("tasks/to.md");
    std::fs::rename(&from_abs, &to_abs).expect("rename");

    handle_batch(&rename_batch(from_abs, to_abs), &ctx);

    let entries = drain_log(&log);
    assert_eq!(2, entries.len());
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/from.md", entries[0].1["payload"]["filePath"]);
    assert_eq!("task-created", entries[1].0);
    assert_eq!("tasks/to.md", entries[1].1["payload"]["task"]["filePath"]);
    assert_eq!(
        entries[0].1["revision"].as_u64().expect("delete revision") + 1,
        entries[1].1["revision"].as_u64().expect("create revision"),
        "rename delete/create must commit as two ordered revisions"
    );
    assert_eq!(
        entries[0].1["eventSeq"].as_u64().expect("delete eventSeq") + 1,
        entries[1].1["eventSeq"].as_u64().expect("create eventSeq"),
        "rename delete/create must emit as two ordered sequence numbers"
    );
    assert_eq!("tasks/from.md", entries[0].1["payload"]["filePath"]);

    assert_eq!(vec!["tasks/to.md".to_string()], snapshot_paths(&state));
}

#[test]
fn rename_onto_an_existing_cached_task_emits_updated_not_created() {
    // rename は fs 層で `removed(from) + upserted(to)` に分解されるため、to 側は
    // 「rename の宛先」という情報を持たない。emit する event 名は cache 存在だけで
    // 決まり、既存タスクを上書きした場合は task-updated になる。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let from_abs = write_md(dir.path(), "tasks/from.md", &task_md("F"));
    let to_abs = write_md(dir.path(), "tasks/to.md", &task_md("T"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(from_abs.clone()), &ctx).expect("seed from");
    handle_change(&TaskFileChange::Upserted(to_abs.clone()), &ctx).expect("seed to");
    drain_log(&log);

    // ファイルシステム上は from を消して to を上書きで置き換える想定。
    std::fs::remove_file(&to_abs).ok();
    std::fs::rename(&from_abs, &to_abs).expect("rename");

    handle_batch(&rename_batch(from_abs, to_abs), &ctx);

    let entries = drain_log(&log);
    assert_eq!(2, entries.len(), "deleted + updated expected");
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/from.md", entries[0].1["payload"]["filePath"]);
    assert_eq!(
        "task-updated", entries[1].0,
        "既に cache にある path への upsert は task-updated になる"
    );
    assert_eq!("tasks/to.md", entries[1].1["payload"]["task"]["filePath"]);
}

#[test]
fn rename_with_unparseable_to_emits_deleted_then_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let from_abs = write_md(dir.path(), "tasks/from.md", &task_md("F"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(from_abs.clone()), &ctx).expect("seed");
    drain_log(&log);

    // to-side の md は frontmatter なし → parse 失敗
    let to_abs = write_md(dir.path(), "tasks/to.md", "no frontmatter\n");
    std::fs::remove_file(&from_abs).ok();

    handle_batch(&rename_batch(from_abs, to_abs), &ctx);

    let entries = drain_log(&log);
    assert_eq!(2, entries.len());
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/from.md", entries[0].1["payload"]["filePath"]);
    assert_eq!(
        "watcher-resync-required", entries[1].0,
        "parse できない to-side は rescan に委ねられる"
    );

    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn rename_with_from_not_in_cache_does_not_emit_deleted_for_atomic_save() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    // from は cache に未登録（atomic save の swap 元のような扱い）。
    let from_abs = dir.path().join("tasks/from.md.tmp");
    let to_abs = write_md(dir.path(), "tasks/to.md", &task_md("T"));

    handle_batch(&rename_batch(from_abs, to_abs), &ctx);

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "only created should fire");
    assert_eq!("task-created", entries[0].0);
    assert_eq!(vec!["tasks/to.md".to_string()], snapshot_paths(&state));
}

#[test]
fn write_ignore_consume_skips_emit_for_self_originated_create() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    active_resources(&state)
        .write_ignore()
        .register(&abs)
        .expect("register write_ignore");

    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty(), "self write should not emit");
    assert!(snapshot_paths(&state).is_empty());
    assert!(active_resources(&state)
        .write_ignore()
        .is_empty()
        .expect("readable"));
}

#[test]
/// parse できない md は full rescan に委ねられる。
///
/// 再 open 側は同じファイルに `frontmatterParseFailed` の load warning を積んで task を
/// 落とすため、黙って無視すると resident が乖離する。tasks と load_warnings を同じ
/// commit で置き換えられるのは rescan だけ。
fn parse_failure_delegates_to_a_full_rescan() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", "---\n: invalid\n---\n");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
    assert!(
        snapshot_paths(&state).is_empty(),
        "parse できない md は task にならない"
    );
}

#[test]
fn read_failure_does_not_emit_or_mutate_cache() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("tasks/missing.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn path_outside_root_is_ignored() {
    let root = TempDir::new().expect("root tempdir");
    let other = TempDir::new().expect("other tempdir");
    let state = Arc::new(AppState::new());
    let outside = write_md(other.path(), "tasks/x.md", &task_md("X"));
    let (ctx, log) = build_ctx(root.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(outside), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn uppercase_md_extension_is_accepted() {
    // scanner は `.MD` / `.Md` も対象。watcher 側でも揃える必要がある（初回 scan
    // で読まれた `A.MD` の変更を watcher で取りこぼさないため）。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/A.MD", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
    assert_eq!("tasks/A.MD", entries[0].1["payload"]["task"]["filePath"]);
}

#[test]
fn dotfile_md_is_ignored() {
    // scanner はドット始まりのファイル名を除外する（`.hidden.md` 等）。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/.hidden.md", &task_md("H"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn dot_directory_descendant_md_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), ".git/notes.md", &task_md("Hidden"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn node_modules_descendant_md_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "node_modules/x/readme.md", &task_md("X"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn oversized_md_is_ignored() {
    // scanner は 1MB 超を除外する。watcher 側でも揃える（巨大ファイルを read で
    // 丸読みして OOM / レスポンス劣化を起こさない）。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let header = "---\ntitle: Big\nstatus: Todo\n---\n";
    let mut body = String::with_capacity(1024 * 1024 + header.len() + 64);
    body.push_str(header);
    body.push_str(&"x".repeat(1024 * 1024 + 32));
    let abs = write_md(dir.path(), "tasks/big.md", &body);
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[cfg(unix)]
#[test]
fn symlink_md_to_outside_root_is_ignored() {
    // scanner は WalkDir::follow_links(false) で symlink を辿らない。watcher 側でも
    // 揃えることで、root 外の任意ファイルを watcher 経由で読み取られないようにする。
    let dir = TempDir::new().expect("tempdir");
    let other = TempDir::new().expect("other tempdir");
    let state = Arc::new(AppState::new());

    let outside = write_md(other.path(), "tasks/outside.md", &task_md("Outside"));
    let link = dir.path().join("tasks/link.md");
    std::fs::create_dir_all(link.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(&outside, &link).expect("create symlink");

    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(link), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn binary_md_with_nul_byte_is_ignored() {
    // scanner は先頭 8KB に NUL を含むファイルを除外する。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("tasks/bin.md");
    std::fs::create_dir_all(abs.parent().unwrap()).unwrap();
    let mut bytes = b"---\ntitle: Bin\nstatus: Todo\n---\n".to_vec();
    bytes.push(0u8);
    bytes.extend_from_slice(b"binary tail");
    std::fs::write(&abs, bytes).expect("write");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn non_markdown_extension_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let txt = write_md(dir.path(), "tasks/a.txt", "plain text");
    let cfg = write_md(dir.path(), ".spec-board/config.json", "{}");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(txt), &ctx).expect("ok");
    handle_change(&TaskFileChange::Upserted(cfg), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_cached_path_emits_task_deleted_and_removes_from_cache() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    std::fs::remove_file(&abs).expect("remove file");

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one task-deleted expected");
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/a.md", entries[0].1["payload"]["filePath"]);
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_payload_uses_forward_slash_relative_path() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/sub/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    std::fs::remove_file(&abs).ok();
    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!(json!("tasks/sub/a.md"), entries[0].1["payload"]["filePath"]);
}

#[test]
fn removed_event_for_uncached_path_does_not_emit() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("tasks/ghost.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn write_ignore_consume_skips_emit_for_self_originated_remove() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    active_resources(&state)
        .write_ignore()
        .register(&abs)
        .expect("register write_ignore");

    std::fs::remove_file(&abs).ok();
    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty(), "self delete should not emit");
    assert_eq!(vec!["tasks/a.md".to_string()], snapshot_paths(&state));
    assert!(active_resources(&state)
        .write_ignore()
        .is_empty()
        .expect("readable"));
}

#[test]
fn removed_event_for_non_markdown_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.txt", "plain text");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_dotfile_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join(".spec-board/x.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_node_modules_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("node_modules/x/y.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_path_outside_root_is_ignored() {
    let root = TempDir::new().expect("root tempdir");
    let other = TempDir::new().expect("other tempdir");
    let state = Arc::new(AppState::new());
    let outside = other.path().join("tasks/x.md");
    let (ctx, log) = build_ctx(root.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Removed(outside), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn empty_batch_emits_nothing() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_batch(&FileChangeBatch::default(), &ctx);

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn task_created_payload_uses_camel_case_with_full_task() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("ok");

    let entries = drain_log(&log);
    let payload = &entries[0].1["payload"];
    let task = &payload["task"];
    assert_eq!("tasks/a.md", task["filePath"]);
    assert_eq!("tasks/a.md", task["id"]);
    assert!(task.get("reverseLinks").is_some(), "camelCase reverseLinks");
}

#[test]
fn task_deleted_payload_contains_forward_slash_relative_path() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/sub/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed");
    drain_log(&log);

    let from_abs = abs;
    let to_abs = dir.path().join("tasks/sub/b.md");
    std::fs::rename(&from_abs, &to_abs).expect("rename");

    handle_batch(&rename_batch(from_abs, to_abs), &ctx);

    let entries = drain_log(&log);
    let deleted = entries
        .iter()
        .find(|(name, _)| name == "task-deleted")
        .expect("deleted emitted");
    assert_eq!(json!("tasks/sub/a.md"), deleted.1["payload"]["filePath"]);
}

#[test]
fn run_event_loop_processes_multiple_batches_then_exits_on_disconnect() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs_a = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let abs_b = write_md(dir.path(), "tasks/b.md", &task_md("B"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    let (tx, rx) = std::sync::mpsc::channel::<FileChangeBatch>();

    let join = std::thread::spawn(move || run_event_loop(rx, ctx));
    tx.send(upsert_batch(abs_a)).expect("send a");
    tx.send(upsert_batch(abs_b)).expect("send b");
    drop(tx);
    join.join().expect("loop should exit cleanly");

    let entries = drain_log(&log);
    assert_eq!(2, entries.len());
}

#[test]
fn adapter_thread_with_panicking_emit_does_not_crash_test_thread() {
    // emit closure が panic しても、`spawn_adapter_with_ctx` の catch_unwind が
    // adapter スレッド内で握り潰し、テスト本体プロセスは生存することを確認する。
    // `Watcher` の所有を扱う煩雑さを避けるため、`spawn_adapter_with_ctx` 自体は
    // 使わず、同じ catch_unwind 構造を持つ thread::spawn を直接立てる。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let identity = install_active_session(&state, dir.path());
    let panicking_emit: EmitFn = Box::new(|_event, _payload| {
        panic!("emit panic in test");
    });
    let ctx = AdapterContext {
        project_root: identity.project_root().clone(),
        session_id: identity.version().session_id,
        state,
        emit: panicking_emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
        config_writer: Arc::new(FsConfigWriter) as Arc<dyn ConfigWriter + Send + Sync>,
    };
    let (tx, rx) = std::sync::mpsc::channel::<FileChangeBatch>();

    let join = std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_event_loop(rx, ctx);
        }));
        result.is_err()
    });
    tx.send(upsert_batch(abs)).expect("send create");
    drop(tx);
    let panicked = join.join().expect("thread should not abort the process");
    assert!(panicked, "emit panic should be caught by catch_unwind");
}

/// cycle member への変更もresidentのraw parentから通常resolverで再計算できる。
#[test]
fn modify_event_for_a_cycle_member_uses_resident_raw_parent() {
    use crate::task::parse::{task_from_markdown, TaskParseContext};
    use crate::task::warning::TaskWarningCode;

    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());

    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    // disk 上は A.md / B.md が相互参照する循環構成。
    let a_body = "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n\nbody\n";
    let abs_a = write_md(dir.path(), "tasks/a.md", a_body);
    let b_body = "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n\nbody\n";
    write_md(dir.path(), "tasks/b.md", b_body);

    // scan と同じ canonical resolver を通した循環構成を cache にセットする。
    let a_parse_ctx = TaskParseContext {
        file_path: PathBuf::from("tasks/a.md"),
        default_status: "Todo".into(),
    };
    let b_parse_ctx = TaskParseContext {
        file_path: PathBuf::from("tasks/b.md"),
        default_status: "Todo".into(),
    };
    replace_parsed_tasks(
        &state,
        vec![
            task_from_markdown(a_body.as_bytes(), &a_parse_ctx).expect("parse A seed"),
            task_from_markdown(b_body.as_bytes(), &b_parse_ctx).expect("parse B seed"),
        ],
    );

    // 外部編集で A.md の本文を更新したものとする（parent は disk 上もそのまま）。
    let updated_body = "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n\nupdated body\n";
    write_md(dir.path(), "tasks/a.md", updated_body);

    handle_change(&TaskFileChange::Upserted(abs_a), &ctx).expect("modify ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one emit expected");
    assert_eq!(
        "task-updated", entries[0].0,
        "変更対象以外のresolved stateが同じなら通常eventを返す"
    );

    let snapshot = state.test_tasks_snapshot().expect("readable");
    for path in ["tasks/a.md", "tasks/b.md"] {
        let task = snapshot
            .iter()
            .find(|task| task.file_path().as_str() == path)
            .unwrap_or_else(|| panic!("{path} in cache"));
        assert!(
            task.parent().is_none(),
            "{path}: 循環が続いている間 parent は None 化される"
        );
        assert!(
            task.warnings()
                .iter()
                .any(|warning| warning.code == TaskWarningCode::ParentCycle
                    && warning.field.as_deref() == Some("parent")),
            "{path}: parentCycle warning が付く"
        );
    }
    assert_eq!(
        snapshot
            .iter()
            .find(|task| task.file_path().as_str() == "tasks/a.md")
            .expect("A in cache")
            .body(),
        "\nupdated body\n",
        "本文の更新は取り込まれる"
    );
}

#[test]
fn modify_event_for_non_cycle_task_does_not_inject_parent_cycle_warning() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());

    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_change(&TaskFileChange::Upserted(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("modify ok");

    let snapshot = state.test_tasks_snapshot().expect("readable");
    let a = snapshot
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/a.md")
        .expect("A in cache");
    assert!(
        !a.warnings()
            .iter()
            .any(|w| w.code == crate::task::warning::TaskWarningCode::ParentCycle),
        "非 cycle task に parentCycle warning が混入してはならない"
    );
}

#[test]
fn modify_event_drops_parent_cycle_warning_when_disk_parent_is_removed() {
    use crate::task::parse::{task_from_markdown, TaskParseContext};
    use crate::task::warning::TaskWarningCode;

    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());

    // 元々 A.md は parent: tasks/b.md で B.md と循環していた。
    let a_initial = "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n\nbody\n";
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    let abs_a = write_md(dir.path(), "tasks/a.md", a_initial);
    let b_body = "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n\nbody\n";
    write_md(dir.path(), "tasks/b.md", b_body);

    let a_parse_ctx = TaskParseContext {
        file_path: PathBuf::from("tasks/a.md"),
        default_status: "Todo".into(),
    };
    let b_parse_ctx = TaskParseContext {
        file_path: PathBuf::from("tasks/b.md"),
        default_status: "Todo".into(),
    };
    replace_parsed_tasks(
        &state,
        vec![
            task_from_markdown(a_initial.as_bytes(), &a_parse_ctx).expect("parse A seed"),
            task_from_markdown(b_body.as_bytes(), &b_parse_ctx).expect("parse B seed"),
        ],
    );

    // ユーザーが外部編集で A.md から parent を除去して循環を解消した。
    let a_resolved = "---\ntitle: A\nstatus: Todo\n---\n\nresolved body\n";
    write_md(dir.path(), "tasks/a.md", a_resolved);

    handle_change(&TaskFileChange::Upserted(abs_a), &ctx).expect("modify ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one emit expected");
    assert_eq!("watcher-resync-required", entries[0].0);

    let snapshot = state.test_tasks_snapshot().expect("readable");
    let a = snapshot
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/a.md")
        .expect("A in cache");

    assert!(
        a.parent().is_none(),
        "disk 側で parent を消した結果がそのまま反映される"
    );
    assert!(
        !a.warnings()
            .iter()
            .any(|w| w.code == TaskWarningCode::ParentCycle),
        "disk 側で parent が消えた以上、parentCycle warning は維持しない"
    );

    let b = snapshot
        .iter()
        .find(|t| t.file_path().as_str() == "tasks/b.md")
        .expect("B in cache");
    assert_eq!(
        b.parent().as_ref().map(|parent| parent.as_str()),
        Some("tasks/a.md"),
        "residentのraw parentから相手側のeffective parentも復元される"
    );
    assert!(
        !b.warnings()
            .iter()
            .any(|w| w.code == TaskWarningCode::ParentCycle),
        "循環が解けた以上、相手側の warning も消える"
    );
}

// ───────── projection の cache 鮮度（`Task.children` 非依存の実証） ─────────

fn task_md_with_parent(title: &str, parent: &str) -> String {
    format!("---\ntitle: {title}\nstatus: Todo\nparent: {parent}\n---\n\nbody\n")
}

fn cached_children(state: &AppState, file_path: &str) -> Vec<String> {
    state
        .test_tasks_snapshot()
        .expect("readable")
        .into_iter()
        .find(|task| task.file_path().as_str() == file_path)
        .unwrap_or_else(|| panic!("cached task {file_path}"))
        .children()
        .iter()
        .map(|path| path.as_str().to_owned())
        .collect()
}

fn projections(state: &AppState) -> crate::task::projection::TaskProjectionMap {
    crate::task::get::get_tasks_impl(state)
        .expect("get_tasks should succeed")
        .projections
}

/// watcher 経由で作られた子が親の projection に計上されることを固定する。
#[test]
fn watcher_created_child_is_counted_in_parent_projection() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let (ctx, _log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    let parent_abs = write_md(dir.path(), "tasks/p.md", &task_md("P"));
    handle_change(&TaskFileChange::Upserted(parent_abs), &ctx).expect("seed parent");
    let child_abs = write_md(
        dir.path(),
        "tasks/c.md",
        &task_md_with_parent("C", "tasks/p.md"),
    );

    handle_change(&TaskFileChange::Upserted(child_abs), &ctx).expect("handler should succeed");

    assert_eq!(
        cached_children(&state, "tasks/p.md"),
        vec!["tasks/c.md".to_string()],
        "派生値を全件作り直すので、親の children が子に追従する"
    );
    let map = projections(&state);
    assert_eq!(map["tasks/p.md"].sub_issue_progress.total, 1);
    assert_eq!(map["tasks/p.md"].sub_issue_progress.done, 0);
    assert_eq!(
        map["tasks/p.md"]
            .child_file_paths
            .iter()
            .map(|path| path.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/c.md"]
    );
}

/// watcher 経由の reparent で新旧の親 projection が入れ替わることを固定する。
#[test]
fn watcher_reparent_moves_child_between_projections() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let (ctx, _log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    for parent in ["tasks/p1.md", "tasks/p2.md"] {
        let abs = write_md(dir.path(), parent, &task_md("P"));
        handle_change(&TaskFileChange::Upserted(abs), &ctx).expect("seed parent");
    }
    let child_abs = write_md(
        dir.path(),
        "tasks/c.md",
        &task_md_with_parent("C", "tasks/p1.md"),
    );
    handle_change(&TaskFileChange::Upserted(child_abs.clone()), &ctx).expect("seed child");

    write_md(
        dir.path(),
        "tasks/c.md",
        &task_md_with_parent("C", "tasks/p2.md"),
    );
    handle_change(&TaskFileChange::Upserted(child_abs), &ctx).expect("handler should succeed");

    let map = projections(&state);
    assert_eq!(map["tasks/p1.md"].sub_issue_progress.total, 0);
    assert!(map["tasks/p1.md"].child_file_paths.is_empty());
    assert_eq!(map["tasks/p2.md"].sub_issue_progress.total, 1);
    assert_eq!(
        map["tasks/p2.md"]
            .child_file_paths
            .iter()
            .map(|path| path.as_str())
            .collect::<Vec<_>>(),
        vec!["tasks/c.md"]
    );
}

/// watcher 経由で新規に作られた parent 循環が、その場で warning に変換される。
///
/// 派生値を全件作り直すので、循環はイベント処理の時点で検出され、メンバーの
/// `parent` は None、`parentCycle` warning つきで cache に載る。cache に循環が
/// 残らないため、projection は親子関係を持たない状態として計算される。
#[test]
fn watcher_introduced_parent_cycle_becomes_a_warning() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let (ctx, _log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    let a_abs = write_md(
        dir.path(),
        "tasks/a.md",
        &task_md_with_parent("A", "tasks/b.md"),
    );
    handle_change(&TaskFileChange::Upserted(a_abs), &ctx).expect("seed a");
    let b_abs = write_md(dir.path(), "tasks/b.md", &task_md("B"));
    handle_change(&TaskFileChange::Upserted(b_abs.clone()), &ctx).expect("seed b");

    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md_with_parent("B", "tasks/a.md"),
    );
    handle_change(&TaskFileChange::Upserted(b_abs), &ctx).expect("handler should succeed");

    let snapshot = state.test_tasks_snapshot().expect("readable");
    for path in ["tasks/a.md", "tasks/b.md"] {
        let task = snapshot
            .iter()
            .find(|task| task.file_path().as_str() == path)
            .unwrap_or_else(|| panic!("{path} in cache"));
        assert!(
            task.parent().is_none(),
            "{path}: 循環メンバーの parent は None"
        );
        assert!(
            task.warnings()
                .iter()
                .any(|warning| warning.code == crate::task::warning::TaskWarningCode::ParentCycle),
            "{path}: parentCycle warning が付く"
        );
    }

    let map = projections(&state);
    assert_eq!(map["tasks/a.md"].sub_issue_progress.total, 0);
    assert_eq!(map["tasks/b.md"].sub_issue_progress.total, 0);
}
