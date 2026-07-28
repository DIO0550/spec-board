//! `handle_event` の identity guard と envelope 化に対する単体テスト。
//!
//! 差分更新そのものの挙動は `watcher_event/tests.rs` が担当し、ここでは
//! 「どの session の event として emit されるか」「連番がどう進むか」を固定する。

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tempfile::TempDir;

use super::{handle_event, HandleError};
use crate::state::project_generation::ProjectGeneration;
use crate::state::project_key::ProjectKey;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::watcher_event::{AdapterContext, EmitFn};
use spec_board_fs::watcher::core::{FsEvent, WatcherFailure, WatcherFailureKind};

type EmitLog = Arc<Mutex<Vec<(String, Value)>>>;

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

/// `open_project` 相当の commit を行い、現行世代の adapter context を作る。
fn build_installed_ctx(root: &Path) -> (Arc<crate::state::AppState>, AdapterContext, EmitLog) {
    let state = Arc::new(crate::state::AppState::new());
    state
        .install_project_session(root, Default::default())
        .expect("install session");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |event, payload| {
        log_clone
            .lock()
            .expect("emit log")
            .push((event.to_string(), payload));
    });
    let ctx = AdapterContext {
        root: root.to_path_buf(),
        default_status: "Todo".into(),
        project_key: ProjectKey::from_root(root),
        generation: state.project_generation(),
        state: Arc::clone(&state),
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
    };
    (state, ctx, log)
}

fn drain(log: &EmitLog) -> Vec<(String, Value)> {
    log.lock().expect("emit log").drain(..).collect()
}

#[test]
fn upsert_emits_an_envelope_carrying_the_session_identity() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));

    handle_event(&FsEvent::Created(abs), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("task-created", entries[0].0);
    let envelope = &entries[0].1;
    assert_eq!(
        dir.path().to_string_lossy().as_ref(),
        envelope["projectKey"].as_str().expect("projectKey")
    );
    assert_eq!(1, envelope["generation"]);
    assert_eq!(true, envelope["cacheMutating"]);
    assert_eq!("1-1", envelope["changeId"]);
    assert_eq!("tasks/a.md", envelope["payload"]["task"]["filePath"]);
}

#[test]
fn events_from_a_stale_generation_touch_neither_the_cache_nor_the_emitter() {
    let dir = TempDir::new().expect("tempdir");
    let (state, mut ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    // 旧 watcher が生き残ったまま新しい project が commit された状況を再現する。
    ctx.generation = ProjectGeneration::from_raw(ctx.generation.as_u64() - 1);
    let revision_before = state.tasks_revision();

    handle_event(&FsEvent::Created(abs), &ctx).expect("handler ok");

    assert!(drain(&log).is_empty(), "旧世代は一切 emit してはならない");
    assert!(state.tasks_snapshot().expect("readable").is_empty());
    assert_eq!(revision_before, state.tasks_revision());
}

#[test]
fn consecutive_upserts_advance_both_revision_and_event_seq() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    let first = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let second = write_md(dir.path(), "tasks/b.md", &task_md("B"));

    handle_event(&FsEvent::Created(first), &ctx).expect("handler ok");
    handle_event(&FsEvent::Created(second), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries[0].1["eventSeq"]);
    assert_eq!(2, entries[1].1["eventSeq"]);
    assert!(
        entries[0].1["revision"].as_u64() < entries[1].1["revision"].as_u64(),
        "revision も単調増加する"
    );
}

#[test]
fn event_seq_is_consumed_even_when_the_emitter_drops_the_event() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    state
        .install_project_session(dir.path(), Default::default())
        .expect("install session");
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let dropped = Arc::new(Mutex::new(false));
    let dropped_clone = Arc::clone(&dropped);
    // AppHandle::emit の失敗を模す。EmitFn は成否を返さないため、
    // 「呼ばれたが配信されなかった」を無記録で表現する。
    let emit: EmitFn = Box::new(move |event, payload| {
        let mut first = dropped_clone.lock().expect("flag");
        if !*first {
            *first = true;
            return;
        }
        log_clone
            .lock()
            .expect("emit log")
            .push((event.to_string(), payload));
    });
    let ctx = AdapterContext {
        root: dir.path().to_path_buf(),
        default_status: "Todo".into(),
        project_key: ProjectKey::from_root(dir.path()),
        generation: state.project_generation(),
        state: Arc::clone(&state),
        emit,
        io: Arc::new(FsTaskIo) as Arc<dyn TaskIo>,
    };
    let first = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let second = write_md(dir.path(), "tasks/b.md", &task_md("B"));

    handle_event(&FsEvent::Created(first), &ctx).expect("handler ok");
    handle_event(&FsEvent::Created(second), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!(
        2, entries[0].1["eventSeq"],
        "emit が失敗しても連番は戻さない（欠番 → FE の gap 検知 → 自動再取得）"
    );
}

#[test]
fn delete_emits_an_envelope_with_the_relative_file_path_only() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed");
    drain(&log);
    std::fs::remove_file(&abs).expect("remove md");

    handle_event(&FsEvent::Removed(abs), &ctx).expect("handler ok");

    let entries = drain(&log);
    assert_eq!("task-deleted", entries[0].0);
    assert_eq!(true, entries[0].1["cacheMutating"]);
    assert_eq!("tasks/a.md", entries[0].1["payload"]["filePath"]);
    assert!(entries[0].1["payload"].get("task").is_none());
}

// ───────── FsEvent::Rescan（full reconciliation） ─────────

/// `read` のたびに `tasks_cache` を触って revision を進める `TaskIo`。
///
/// 「走査中に mutation command が commit した」状況を、スレッドを使わずに
/// 決定的に再現するためのテストダブル。
struct RevisionBumpingIo {
    inner: FsTaskIo,
    state: Arc<crate::state::AppState>,
    /// 残り何回 bump するか。0 になったら以後は素通しする。
    remaining_bumps: Mutex<u32>,
    reads: Mutex<u32>,
}

impl RevisionBumpingIo {
    fn new(state: Arc<crate::state::AppState>, bumps: u32) -> Self {
        Self {
            inner: FsTaskIo,
            state,
            remaining_bumps: Mutex::new(bumps),
            reads: Mutex::new(0),
        }
    }

    fn read_count(&self) -> u32 {
        *self.reads.lock().expect("reads")
    }
}

impl TaskIo for RevisionBumpingIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        *self.reads.lock().expect("reads") += 1;
        let mut remaining = self.remaining_bumps.lock().expect("bumps");
        if *remaining > 0 {
            *remaining -= 1;
            self.state
                .with_tasks_cache_mut(|_| ())
                .expect("bump revision");
        }
        self.inner.read(path)
    }
}

fn ctx_with_io(
    root: &Path,
    state: &Arc<crate::state::AppState>,
    io: Arc<dyn TaskIo>,
) -> (AdapterContext, EmitLog) {
    let log: EmitLog = Arc::new(Mutex::new(Vec::new()));
    let log_clone = Arc::clone(&log);
    let emit: EmitFn = Box::new(move |event, payload| {
        log_clone
            .lock()
            .expect("emit log")
            .push((event.to_string(), payload));
    });
    let ctx = AdapterContext {
        root: root.to_path_buf(),
        default_status: "Todo".into(),
        project_key: ProjectKey::from_root(root),
        generation: state.project_generation(),
        state: Arc::clone(state),
        emit,
        io,
    };
    (ctx, log)
}

#[test]
fn rescan_fills_an_empty_cache_from_disk_and_requests_a_single_resync() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    for name in ["a", "b", "c"] {
        write_md(dir.path(), &format!("tasks/{name}.md"), &task_md(name));
    }

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    let mut paths: Vec<String> = state
        .tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|task| task.file_path.into_string())
        .collect();
    paths.sort();
    assert_eq!(
        vec![
            "tasks/a.md".to_string(),
            "tasks/b.md".to_string(),
            "tasks/c.md".to_string()
        ],
        paths
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-resync-required", entries[0].0);
}

#[test]
fn rescan_converges_a_diverged_cache_onto_the_disk_contents() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let stale = write_md(dir.path(), "tasks/stale.md", &task_md("Stale"));
    handle_event(&FsEvent::Created(stale.clone()), &ctx).expect("seed stale");
    std::fs::remove_file(&stale).expect("remove stale from disk");
    write_md(dir.path(), "tasks/fresh.md", &task_md("Fresh"));
    drain(&log);

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    let paths: Vec<String> = state
        .tasks_snapshot()
        .expect("readable")
        .into_iter()
        .map(|task| task.file_path.into_string())
        .collect();
    assert_eq!(vec!["tasks/fresh.md".to_string()], paths);
}

#[test]
fn resync_request_carries_only_a_reason_and_never_a_snapshot() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    let entries = drain(&log);
    assert_eq!(
        serde_json::json!({ "reason": "rescan" }),
        entries[0].1["payload"],
        "全 task を載せると 1 event が数 MB になる"
    );
}

#[test]
fn rescan_envelope_reports_the_bumped_revision_as_cache_mutating() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let before = state.tasks_revision().as_u64();

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    let entries = drain(&log);
    assert_eq!(before + 1, state.tasks_revision().as_u64());
    assert_eq!(state.tasks_revision().as_u64(), entries[0].1["revision"]);
    assert_eq!(true, entries[0].1["cacheMutating"]);
}

#[test]
fn rescan_retries_the_scan_when_the_revision_moved_while_scanning() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    state
        .install_project_session(dir.path(), Default::default())
        .expect("install session");
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let io = Arc::new(RevisionBumpingIo::new(Arc::clone(&state), 1));
    let (ctx, log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    assert_eq!(
        2,
        io.read_count(),
        "1 回目は CAS 不一致で捨て、走査からやり直す"
    );
    assert_eq!(1, state.tasks_snapshot().expect("readable").len());
    assert_eq!(1, drain(&log).len());
}

#[test]
fn rescan_gives_up_without_committing_when_the_state_keeps_moving() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    state
        .install_project_session(dir.path(), Default::default())
        .expect("install session");
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    // 毎回 revision が進み続けるので CAS は一度も成功しない。
    let io = Arc::new(RevisionBumpingIo::new(Arc::clone(&state), u32::MAX));
    let (ctx, log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    assert_eq!(3, io.read_count(), "上限 3 回で打ち切る");
    assert!(
        state.tasks_snapshot().expect("readable").is_empty(),
        "最終試行を無条件で採用すると、その走査中の config 変更まで確定させてしまう"
    );
    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-diagnostic", entries[0].0);
    assert_eq!("rescanFailed", entries[0].1["payload"]["code"]);
}

#[test]
fn rescan_clears_the_write_ignore_registry() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    state
        .write_ignore()
        .register(dir.path().join("tasks/self-written.md"))
        .expect("register");

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    assert!(
        state.write_ignore().is_empty().expect("readable"),
        "stale entry が残ると以後の自前 write 判定を誤らせる"
    );
}

#[test]
fn rescan_on_an_empty_project_empties_the_cache_and_still_requests_a_resync() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_event(&FsEvent::Created(abs.clone()), &ctx).expect("seed");
    std::fs::remove_file(&abs).expect("remove md");
    drain(&log);

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    assert!(state.tasks_snapshot().expect("readable").is_empty());
    assert_eq!(1, drain(&log).len());
}

#[test]
fn rescan_handles_the_already_empty_and_single_file_boundaries() {
    let empty_dir = TempDir::new().expect("tempdir");
    let (empty_state, empty_ctx, empty_log) = build_installed_ctx(empty_dir.path());

    handle_event(&FsEvent::Rescan, &empty_ctx).expect("rescan ok");

    assert!(empty_state.tasks_snapshot().expect("readable").is_empty());
    assert_eq!(1, drain(&empty_log).len());

    let single_dir = TempDir::new().expect("tempdir");
    let (single_state, single_ctx, single_log) = build_installed_ctx(single_dir.path());
    write_md(single_dir.path(), "tasks/only.md", &task_md("Only"));

    handle_event(&FsEvent::Rescan, &single_ctx).expect("rescan ok");

    assert_eq!(1, single_state.tasks_snapshot().expect("readable").len());
    assert_eq!(1, drain(&single_log).len());
}

#[test]
fn rescan_failure_keeps_the_cache_and_reports_a_diagnostic_only() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_event(&FsEvent::Created(abs), &ctx).expect("seed");
    drain(&log);
    let revision_before = state.tasks_revision();
    std::fs::remove_dir_all(dir.path()).expect("remove project root");

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan reports instead of failing");

    assert_eq!(1, state.tasks_snapshot().expect("readable").len());
    assert_eq!(revision_before, state.tasks_revision());
    let entries = drain(&log);
    assert_eq!("watcher-diagnostic", entries[0].0);
    assert_eq!("rescanFailed", entries[0].1["payload"]["code"]);
    assert_eq!(false, entries[0].1["cacheMutating"]);
}

#[test]
fn rescan_surfaces_a_poisoned_tasks_cache_as_a_handle_error() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    let poison_state = Arc::clone(&state);
    let _ = std::thread::spawn(move || {
        poison_state
            .with_tasks_cache_mut(|_| panic!("poison tasks_cache"))
            .ok();
    })
    .join();

    let error = handle_event(&FsEvent::Rescan, &ctx).expect_err("poisoned lock surfaces");

    assert!(matches!(error, HandleError::StateLock(_)));
}

#[test]
fn a_late_modify_after_a_rescan_still_lands_with_a_higher_revision() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");
    let rescan_revision = state.tasks_revision();
    drain(&log);

    write_md(dir.path(), "tasks/a.md", &task_md("A2"));
    handle_event(&FsEvent::Modified(abs), &ctx).expect("modify ok");

    let tasks = state.tasks_snapshot().expect("readable");
    assert_eq!(1, tasks.len());
    assert_eq!("A2", tasks[0].title);
    assert!(rescan_revision < state.tasks_revision());
    let entries = drain(&log);
    assert!(
        rescan_revision.as_u64() < entries[0].1["revision"].as_u64().expect("revision"),
        "Rescan を追い越した event ではないことが revision で判る"
    );
}

// ───────── FsEvent::Error（structured diagnostics） ─────────

fn failure(kind: WatcherFailureKind, detail: &str, paths: Vec<PathBuf>) -> WatcherFailure {
    WatcherFailure {
        kind,
        paths,
        detail: detail.to_string(),
    }
}

#[test]
fn backend_failure_is_reported_as_a_watcher_diagnostic() {
    let dir = TempDir::new().expect("tempdir");
    let (_state, ctx, log) = build_installed_ctx(dir.path());

    handle_event(
        &FsEvent::Error(failure(
            WatcherFailureKind::ResourceExhausted,
            "inotify watch limit reached",
            vec![dir.path().join("tasks")],
        )),
        &ctx,
    )
    .expect("handler ok");

    let entries = drain(&log);
    assert_eq!(1, entries.len());
    assert_eq!("watcher-diagnostic", entries[0].0);
    let payload = &entries[0].1["payload"];
    assert_eq!("resourceExhausted", payload["code"]);
    assert_eq!("inotify watch limit reached", payload["message"]);
    assert_eq!(
        serde_json::json!([dir.path().join("tasks").to_string_lossy()]),
        payload["paths"]
    );
}

#[test]
fn a_diagnostic_leaves_the_cache_and_revision_untouched() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    let abs = write_md(dir.path(), "tasks/a.md", &task_md("A"));
    handle_event(&FsEvent::Created(abs), &ctx).expect("seed");
    drain(&log);
    let revision_before = state.tasks_revision();

    handle_event(
        &FsEvent::Error(failure(WatcherFailureKind::Io, "read error", Vec::new())),
        &ctx,
    )
    .expect("handler ok");

    let entries = drain(&log);
    assert_eq!(
        false, entries[0].1["cacheMutating"],
        "true にすると FE が revision の単調性を要求して通知が 1 度も届かない"
    );
    assert_eq!(revision_before, state.tasks_revision());
    assert_eq!(1, state.tasks_snapshot().expect("readable").len());
}

#[test]
fn every_watcher_failure_kind_maps_to_a_diagnostic_code() {
    let cases = [
        (
            WatcherFailureKind::WatchPathUnavailable,
            "watchPathUnavailable",
        ),
        (WatcherFailureKind::ResourceExhausted, "resourceExhausted"),
        (WatcherFailureKind::PermissionDenied, "permissionDenied"),
        (WatcherFailureKind::Io, "io"),
        (WatcherFailureKind::Unknown, "unknown"),
    ];

    for (kind, expected) in cases {
        let dir = TempDir::new().expect("tempdir");
        let (_state, ctx, log) = build_installed_ctx(dir.path());

        handle_event(&FsEvent::Error(failure(kind, "detail", Vec::new())), &ctx)
            .expect("handler ok");

        let entries = drain(&log);
        assert_eq!(
            serde_json::Value::from(expected),
            entries[0].1["payload"]["code"],
            "{kind:?} の写像が期待と異なる"
        );
    }
}

#[test]
fn rescan_resolves_the_default_status_from_the_current_config() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    // spawn 時点の既定は "Todo"。カラム更新で先頭が "Backlog" に変わった状況を作る。
    state
        .replace_config(Some(crate::config::Config {
            version: 1,
            columns: vec![crate::config::Column {
                name: "Backlog".into(),
                order: 0,
                color: None,
            }],
            card_order: Default::default(),
            done_column: None,
        }))
        .expect("writable");
    write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    let tasks = state.tasks_snapshot().expect("readable");
    assert_eq!(1, tasks.len());
    assert_eq!(
        "Backlog",
        tasks[0].status.as_str(),
        "spawn 時に焼き込んだ既定 status を使うと reopen 時と結果が食い違う"
    );
}

#[test]
fn rescan_still_requests_a_resync_when_clearing_write_ignore_fails() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, log) = build_installed_ctx(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    state.write_ignore().poison_lock_for_testing();

    let error = handle_event(&FsEvent::Rescan, &ctx).expect_err("clear failure surfaces");

    let entries = drain(&log);
    assert_eq!(
        1,
        entries.len(),
        "cache は置換済みなので再取得要求は必ず届ける"
    );
    assert_eq!("watcher-resync-required", entries[0].0);
    assert!(matches!(error, HandleError::WriteIgnore(_)));
    assert_eq!(1, state.tasks_snapshot().expect("readable").len());
}

#[test]
fn upsert_resolves_the_default_status_from_the_current_config() {
    let dir = TempDir::new().expect("tempdir");
    let (state, ctx, _log) = build_installed_ctx(dir.path());
    state
        .replace_config(Some(crate::config::Config {
            version: 1,
            columns: vec![crate::config::Column {
                name: "Backlog".into(),
                order: 0,
                color: None,
            }],
            card_order: Default::default(),
            done_column: None,
        }))
        .expect("writable");
    let abs = write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );

    handle_event(&FsEvent::Modified(abs), &ctx).expect("modify ok");

    let tasks = state.tasks_snapshot().expect("readable");
    assert_eq!(
        "Backlog",
        tasks[0].status.as_str(),
        "rescan で復旧した既定 status が後続の Modified で spawn 時の値に戻ってはならない"
    );
}

#[test]
fn rescan_reresolves_the_default_status_on_every_retry() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    state
        .install_project_session(dir.path(), Default::default())
        .expect("install session");
    write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );
    // 1 回目の走査中に config が差し替わり、CAS も不一致になる状況を作る。
    let io = Arc::new(ConfigSwappingIo::new(Arc::clone(&state)));
    let (ctx, _log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    let tasks = state.tasks_snapshot().expect("readable");
    assert_eq!(
        "Backlog",
        tasks[0].status.as_str(),
        "再走査は各試行で現在の config から既定 status を解決する"
    );
}

/// 最初の `read` で config を差し替えつつ revision も進める `TaskIo`。
struct ConfigSwappingIo {
    inner: FsTaskIo,
    state: Arc<crate::state::AppState>,
    swapped: Mutex<bool>,
}

impl ConfigSwappingIo {
    fn new(state: Arc<crate::state::AppState>) -> Self {
        Self {
            inner: FsTaskIo,
            state,
            swapped: Mutex::new(false),
        }
    }
}

impl TaskIo for ConfigSwappingIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        let mut swapped = self.swapped.lock().expect("swap flag");
        if !*swapped {
            *swapped = true;
            self.state
                .replace_config(Some(crate::config::Config {
                    version: 1,
                    columns: vec![crate::config::Column {
                        name: "Backlog".into(),
                        order: 0,
                        color: None,
                    }],
                    card_order: Default::default(),
                    done_column: None,
                }))
                .expect("writable");
            // CAS を不一致にして再走査させる。
            self.state
                .with_tasks_cache_mut(|_| ())
                .expect("bump revision");
        }
        self.inner.read(path)
    }
}

#[test]
fn rescan_rescans_when_only_the_config_changed_during_the_scan() {
    let dir = TempDir::new().expect("tempdir");
    let state = Arc::new(crate::state::AppState::new());
    state
        .install_project_session(dir.path(), Default::default())
        .expect("install session");
    state
        .replace_config(Some(crate::config::Config {
            version: 1,
            columns: vec![crate::config::Column {
                name: "Todo".into(),
                order: 0,
                color: None,
            }],
            card_order: Default::default(),
            done_column: None,
        }))
        .expect("writable");
    write_md(
        dir.path(),
        "tasks/no-status.md",
        "---\ntitle: NoStatus\n---\n",
    );
    // revision は据え置きのまま config だけ差し替わる（update_columns の実在する窓）。
    let io = Arc::new(ConfigOnlySwappingIo::new(Arc::clone(&state)));
    let (ctx, _log) = ctx_with_io(dir.path(), &state, Arc::clone(&io) as Arc<dyn TaskIo>);

    handle_event(&FsEvent::Rescan, &ctx).expect("rescan ok");

    assert_eq!(
        2,
        io.read_count(),
        "revision が動かなくても既定 status が変われば再走査する"
    );
    let tasks = state.tasks_snapshot().expect("readable");
    assert_eq!("Backlog", tasks[0].status.as_str());
}

/// 最初の `read` で **config だけ**を差し替える（revision は進めない）`TaskIo`。
struct ConfigOnlySwappingIo {
    inner: FsTaskIo,
    state: Arc<crate::state::AppState>,
    swapped: Mutex<bool>,
    reads: Mutex<u32>,
}

impl ConfigOnlySwappingIo {
    fn new(state: Arc<crate::state::AppState>) -> Self {
        Self {
            inner: FsTaskIo,
            state,
            swapped: Mutex::new(false),
            reads: Mutex::new(0),
        }
    }

    fn read_count(&self) -> u32 {
        *self.reads.lock().expect("reads")
    }
}

impl TaskIo for ConfigOnlySwappingIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.ensure_dir(dir)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_new(path, bytes)
    }

    fn write_existing(
        &self,
        path: &Path,
        bytes: &[u8],
    ) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.write_existing(path, bytes)
    }

    fn remove(&self, path: &Path) -> Result<(), crate::task::io::TaskIoError> {
        self.inner.remove(path)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, crate::task::io::TaskIoError> {
        *self.reads.lock().expect("reads") += 1;
        let mut swapped = self.swapped.lock().expect("swap flag");
        if !*swapped {
            *swapped = true;
            self.state
                .replace_config(Some(crate::config::Config {
                    version: 1,
                    columns: vec![crate::config::Column {
                        name: "Backlog".into(),
                        order: 0,
                        color: None,
                    }],
                    card_order: Default::default(),
                    done_column: None,
                }))
                .expect("writable");
        }
        self.inner.read(path)
    }
}
