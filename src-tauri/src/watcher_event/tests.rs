//! `watcher_event::handler` の純粋ハンドラに対する単体テスト。
//!
//! emit を `Vec<(String, serde_json::Value)>` push スタブに差し替え、
//! `Watcher` を起動せずに `handle_event` を直接駆動する。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tempfile::TempDir;

use super::handler::{handle_event, run_event_loop};
use super::{AdapterContext, EmitFn};
use crate::state::AppState;
use crate::task::io::{FsTaskIo, TaskIo};
use spec_board_fs::watcher::core::FsEvent;

type EmitLog = Arc<Mutex<Vec<(String, Value)>>>;

fn build_ctx(root: PathBuf, state: Arc<AppState>) -> (AdapterContext, EmitLog) {
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |ev, payload| {
        log_clone.lock().unwrap().push((ev.to_string(), payload));
    });
    let ctx = AdapterContext {
        root,
        default_status: "Todo".into(),
        state,
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
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
        .tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|t| t.file_path.into_string())
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

    handle_event(&FsEvent::Created(abs), &ctx).expect("handler should succeed");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one emit expected");
    assert_eq!("task-created", entries[0].0);
    assert_eq!("tasks/a.md", entries[0].1["task"]["filePath"]);

    assert_eq!(vec!["tasks/a.md".to_string()], snapshot_paths(&state));
}

#[test]
fn modify_event_for_existing_path_emits_task_updated_and_replaces_cache_entry() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    // 事前に Created で投入する。
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    // 内容を更新して Modified を投入。
    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    handle_event(&FsEvent::Modified(abs), &ctx).expect("modify ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-updated", entries[0].0);
    assert_eq!("A2", entries[0].1["task"]["title"]);

    let tasks = state.tasks_snapshot().expect("readable");
    assert_eq!(1, tasks.len());
    assert_eq!("A2", tasks[0].title);
}

#[test]
fn create_event_for_already_cached_path_emits_task_updated_for_atomic_save() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    // atomic save では rename 後の to-side が Created で再通知されることがある。
    handle_event(&FsEvent::Created(abs), &ctx).expect("create-on-existing");

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
    handle_event(&FsEvent::Created(from_abs.clone()), &ctx).expect("seed");
    drain_log(&log);

    // ファイルを物理的に rename してから FsEvent::Renamed を投入する。
    let to_abs = dir.path().join("tasks/to.md");
    std::fs::rename(&from_abs, &to_abs).expect("rename");

    handle_event(
        &FsEvent::Renamed {
            from: from_abs,
            to: to_abs,
        },
        &ctx,
    )
    .expect("rename ok");

    let entries = drain_log(&log);
    assert_eq!(2, entries.len());
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/from.md", entries[0].1["filePath"]);
    assert_eq!("task-created", entries[1].0);
    assert_eq!("tasks/to.md", entries[1].1["task"]["filePath"]);

    assert_eq!(vec!["tasks/to.md".to_string()], snapshot_paths(&state));
}

#[test]
fn rename_with_to_already_in_cache_emits_created_not_updated() {
    // 仕様上 Rename は「from で task-deleted、to で task-created」と定義されている。
    // to が既存 cache にある場合でも task-updated にならず task-created が emit される
    // ことを担保する。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let from_abs = write_md(dir.path(), "tasks/from.md", &task_md("F"));
    let to_abs = write_md(dir.path(), "tasks/to.md", &task_md("T"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(from_abs.clone()), &ctx).expect("seed from");
    handle_event(&FsEvent::Created(to_abs.clone()), &ctx).expect("seed to");
    drain_log(&log);

    // ファイルシステム上は from を消して to を上書きで置き換える想定。
    std::fs::remove_file(&to_abs).ok();
    std::fs::rename(&from_abs, &to_abs).expect("rename");

    handle_event(
        &FsEvent::Renamed {
            from: from_abs,
            to: to_abs,
        },
        &ctx,
    )
    .expect("rename ok");

    let entries = drain_log(&log);
    assert_eq!(2, entries.len(), "deleted + created expected");
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/from.md", entries[0].1["filePath"]);
    assert_eq!(
        "task-created", entries[1].0,
        "to-side should always be task-created in rename"
    );
    assert_eq!("tasks/to.md", entries[1].1["task"]["filePath"]);
}

#[test]
fn rename_with_unparseable_to_emits_only_deleted_and_removes_from_cache() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let from_abs = write_md(dir.path(), "tasks/from.md", &task_md("F"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(from_abs.clone()), &ctx).expect("seed");
    drain_log(&log);

    // to-side の md は frontmatter なし → parse 失敗
    let to_abs = write_md(dir.path(), "tasks/to.md", "no frontmatter\n");
    std::fs::remove_file(&from_abs).ok();

    handle_event(
        &FsEvent::Renamed {
            from: from_abs,
            to: to_abs,
        },
        &ctx,
    )
    .expect("rename ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/from.md", entries[0].1["filePath"]);

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

    handle_event(
        &FsEvent::Renamed {
            from: from_abs,
            to: to_abs,
        },
        &ctx,
    )
    .expect("rename ok");

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
    state
        .write_ignore()
        .register(&abs)
        .expect("register write_ignore");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty(), "self write should not emit");
    assert!(snapshot_paths(&state).is_empty());
    assert!(state.write_ignore().is_empty().expect("readable"));
}

#[test]
fn parse_failure_does_not_emit_or_mutate_cache() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", "---\n: invalid\n---\n");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn read_failure_does_not_emit_or_mutate_cache() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("tasks/missing.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Modified(abs), &ctx).expect("ok");

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

    handle_event(&FsEvent::Created(outside), &ctx).expect("ok");

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

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
    assert_eq!("tasks/A.MD", entries[0].1["task"]["filePath"]);
}

#[test]
fn dotfile_md_is_ignored() {
    // scanner はドット始まりのファイル名を除外する（`.hidden.md` 等）。
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/.hidden.md", &task_md("H"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn dot_directory_descendant_md_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), ".git/notes.md", &task_md("Hidden"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn node_modules_descendant_md_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "node_modules/x/readme.md", &task_md("X"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

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

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

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
    handle_event(&FsEvent::Created(link), &ctx).expect("ok");

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

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

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

    handle_event(&FsEvent::Created(txt), &ctx).expect("ok");
    handle_event(&FsEvent::Modified(cfg), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_cached_path_emits_task_deleted_and_removes_from_cache() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    std::fs::remove_file(&abs).expect("remove file");

    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one task-deleted expected");
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!("tasks/a.md", entries[0].1["filePath"]);
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_payload_uses_forward_slash_relative_path() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/sub/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    std::fs::remove_file(&abs).ok();
    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!(json!("tasks/sub/a.md"), entries[0].1["filePath"]);
}

#[test]
fn removed_event_for_uncached_path_does_not_emit() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("tasks/ghost.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn write_ignore_consume_skips_emit_for_self_originated_remove() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    state
        .write_ignore()
        .register(&abs)
        .expect("register write_ignore");

    std::fs::remove_file(&abs).ok();
    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty(), "self delete should not emit");
    assert_eq!(vec!["tasks/a.md".to_string()], snapshot_paths(&state));
    assert!(state.write_ignore().is_empty().expect("readable"));
}

#[test]
fn removed_event_for_non_markdown_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.txt", "plain text");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_dotfile_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join(".spec-board/x.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn removed_event_for_node_modules_is_ignored() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = dir.path().join("node_modules/x/y.md");
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Removed(abs), &ctx).expect("removed ok");

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

    handle_event(&FsEvent::Removed(outside), &ctx).expect("removed ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn other_rescan_error_variants_are_no_op() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Other(abs), &ctx).expect("ok");
    handle_event(&FsEvent::Rescan, &ctx).expect("ok");
    handle_event(&FsEvent::Error("backend boom".to_string()), &ctx).expect("ok");

    assert!(drain_log(&log).is_empty());
    assert!(snapshot_paths(&state).is_empty());
}

#[test]
fn task_created_payload_uses_camel_case_with_full_task() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));

    handle_event(&FsEvent::Created(abs), &ctx).expect("ok");

    let entries = drain_log(&log);
    let payload = &entries[0].1;
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
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed");
    drain_log(&log);

    let from_abs = abs;
    let to_abs = dir.path().join("tasks/sub/b.md");
    std::fs::rename(&from_abs, &to_abs).expect("rename");

    handle_event(
        &FsEvent::Renamed {
            from: from_abs,
            to: to_abs,
        },
        &ctx,
    )
    .expect("rename ok");

    let entries = drain_log(&log);
    let deleted = entries
        .iter()
        .find(|(name, _)| name == "task-deleted")
        .expect("deleted emitted");
    assert_eq!(json!("tasks/sub/a.md"), deleted.1["filePath"]);
}

#[test]
fn run_event_loop_processes_multiple_events_then_exits_on_disconnect() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());
    let abs_a = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let abs_b = write_md(dir.path(), "tasks/b.md", &task_md("B"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    let (tx, rx) = std::sync::mpsc::channel::<FsEvent>();

    let join = std::thread::spawn(move || run_event_loop(rx, ctx));
    tx.send(FsEvent::Created(abs_a)).expect("send a");
    tx.send(FsEvent::Created(abs_b)).expect("send b");
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
    let panicking_emit: EmitFn = Box::new(|_event, _payload| {
        panic!("emit panic in test");
    });
    let ctx = AdapterContext {
        root: dir.path().to_path_buf(),
        default_status: "Todo".into(),
        state,
        emit: panicking_emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
    };
    let (tx, rx) = std::sync::mpsc::channel::<FsEvent>();

    let join = std::thread::spawn(move || {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_event_loop(rx, ctx);
        }));
        result.is_err()
    });
    tx.send(FsEvent::Created(abs)).expect("send create");
    drop(tx);
    let panicked = join.join().expect("thread should not abort the process");
    assert!(panicked, "emit panic should be caught by catch_unwind");
}

#[test]
fn modify_event_preserves_parent_cycle_warning_and_parent_none() {
    use crate::task::parse::{task_from_markdown, TaskParseContext};
    use crate::task::warning::{ensure_parent_cycle_warning, TaskWarningCode};

    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());

    // disk 上は A.md / B.md が相互参照する循環構成。
    let a_body = "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n\nbody\n";
    let abs_a = write_md(dir.path(), "tasks/a.md", a_body);
    write_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\nparent: tasks/a.md\n---\n\nbody\n",
    );

    // scan 経路（build_children_with_warnings）通過後の状態を cache に直接セット:
    // A は cycle member として parent=None + parentCycle warning を持つ。
    let parse_ctx = TaskParseContext {
        file_path: PathBuf::from("tasks/a.md"),
        default_status: "Todo".into(),
    };
    let mut seeded = task_from_markdown(a_body.as_bytes(), &parse_ctx).expect("parse seed");
    seeded.parent = None;
    ensure_parent_cycle_warning(&mut seeded.warnings);
    state
        .with_tasks_cache_mut(|cache| {
            cache.insert(PathBuf::from("tasks/a.md"), seeded);
        })
        .expect("seed cache");

    // 外部編集で A.md の本文を更新したものとする（parent は disk 上もそのまま）。
    let updated_body = "---\ntitle: A\nstatus: Todo\nparent: tasks/b.md\n---\n\nupdated body\n";
    write_md(dir.path(), "tasks/a.md", updated_body);

    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Modified(abs_a), &ctx).expect("modify ok");

    let entries = drain_log(&log);
    assert_eq!(1, entries.len(), "one emit expected");
    assert_eq!("task-updated", entries[0].0);

    let snapshot = state.tasks_snapshot().expect("readable");
    let a = snapshot
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .expect("A in cache");

    assert!(
        a.parent.is_none(),
        "cycle member の parent は None のまま保持される（disk の raw parent で復活させない）"
    );
    assert!(
        a.warnings.iter().any(|w| w.code == TaskWarningCode::ParentCycle
            && w.field.as_deref() == Some("parent")),
        "cycle member の parentCycle warning は preserve される"
    );

    let emitted = &entries[0].1["task"];
    assert!(
        emitted.get("parent").is_none_or(|v| v.is_null()),
        "emit payload も parent=None を反映する"
    );
}

#[test]
fn modify_event_for_non_cycle_task_does_not_inject_parent_cycle_warning() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(AppState::new());

    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let (ctx, log) = build_ctx(dir.path().to_path_buf(), Arc::clone(&state));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed create");
    drain_log(&log);

    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    handle_event(&FsEvent::Modified(abs), &ctx).expect("modify ok");

    let snapshot = state.tasks_snapshot().expect("readable");
    let a = snapshot
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .expect("A in cache");
    assert!(
        !a.warnings
            .iter()
            .any(|w| w.code == crate::task::warning::TaskWarningCode::ParentCycle),
        "非 cycle task に parentCycle warning が混入してはならない"
    );
}
