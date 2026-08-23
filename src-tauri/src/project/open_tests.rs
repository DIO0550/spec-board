use super::{
    open_project_impl, open_project_impl_with_reporter, OpenProjectError, OpenProjectPayload,
    ProjectDataPorts,
};

use crate::config::{CardOrder, Column, Config, ConfigWriter, FsConfigWriter};
use crate::project::reactivation::{
    CollectingReactivationScheduler, NoopReactivationScheduler, ReactivationResyncScheduler,
};
use crate::project::watcher_factory::{NoopWatcherFactory, WatcherFactory};
use crate::project::OpenProjectIntent;
use crate::project_session::SessionIdentity;
use crate::state::active_project_resources::{
    pending_activation_state, wait_for_activation, LogWatcherStopDiagnosticReporter,
    StagedProjectResources, WatcherActivation, WatcherStopDiagnostic,
    WatcherStopDiagnosticReporter,
};
use crate::state::event_seq::EventSeq;
use crate::state::project_generation::ProjectGeneration;
use crate::state::project_key::ProjectKey;
use crate::state::tasks_revision::TasksRevision;
use crate::state::watcher_session::WatcherSession;
use crate::state::{AppState, BoxedWatcherHandle};
use crate::task::projection::{
    MilestoneProjectionMap, TaskForest, TaskProjectionMap, TaskTreeNode,
};
use crate::task::task_index::Task;
use spec_board_fs::watcher::core::WatcherError;
use spec_board_fs::watcher::handle::WatcherHandle;
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;
use std::collections::BTreeMap;

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};

use tempfile::TempDir;

/// payload 組み立てテスト用の初期 session（`AppState::new()` 直後の値）。
fn zero_session() -> WatcherSession {
    WatcherSession {
        project_key: ProjectKey::from_root(Path::new("/tmp/project")),
        generation: ProjectGeneration::from_raw(0),
        revision: TasksRevision::from_raw(0),
        event_seq: EventSeq::from_raw(0),
    }
}

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

/// 4 段階手順を保ったまま、`AppHandle` / `Watcher::start` を使わずに
/// `open_project_impl` を駆動するための shorthand。
///
/// 外側シグネチャは `(state: Arc<AppState>, path: &str)` を温存し、内部で
/// `OpenProjectIntent` 構築 + `NoopWatcherFactory` 注入を行う。
fn open_with_noop(
    state: Arc<AppState>,
    path: &str,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let intent = OpenProjectIntent::try_from(path.to_string())?;
    let labels_store = crate::config::label_registry_store(intent.as_path());
    let milestones_store = crate::config::milestone_registry_store(intent.as_path());
    open_project_impl(
        &state,
        &intent,
        &labels_store,
        &milestones_store,
        &NoopWatcherFactory,
    )
}

struct TestPausedHandle {
    join: Option<JoinHandle<()>>,
    on_stop: Option<Box<dyn FnOnce() + Send>>,
}

impl WatcherHandle for TestPausedHandle {
    fn stop(&mut self) {
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
        if let Some(on_stop) = self.on_stop.take() {
            on_stop();
        }
    }
}

fn stage_test_resources(
    identity: SessionIdentity,
    on_active: impl FnOnce() + Send + 'static,
    on_stop: impl FnOnce() + Send + 'static,
) -> Result<StagedProjectResources, OpenProjectError> {
    let activation_state = pending_activation_state();
    let worker_state = Arc::clone(&activation_state);
    let join = thread::Builder::new()
        .name("open-test-paused-watcher".to_owned())
        .spawn(move || {
            if wait_for_activation(worker_state.as_ref()) {
                on_active();
            }
        })
        .map_err(WatcherError::Io)
        .map_err(|source| OpenProjectError::WatcherInitFailed { source })?;
    let activation = WatcherActivation::new(activation_state, join.thread().clone());
    let handle = TestPausedHandle {
        join: Some(join),
        on_stop: Some(Box::new(on_stop)),
    };

    Ok(StagedProjectResources::new(
        identity,
        Box::new(handle) as BoxedWatcherHandle,
        activation,
        Arc::new(WriteIgnoreRegistry::new()),
    ))
}

/// `prepare` で `WatcherInitFailed` を返すテスト用 factory。
struct FailingPrepareFactory {
    init_message: String,
}

impl FailingPrepareFactory {
    fn new(init_message: &str) -> Self {
        Self {
            init_message: init_message.to_string(),
        }
    }
}

impl WatcherFactory for FailingPrepareFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Err(OpenProjectError::WatcherInitFailed {
            source: WatcherError::Init(self.init_message.clone()),
        })
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        _identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        panic!("stage should not be invoked when prepare fails");
    }
}

/// displaced stop が新session commit後に実行されたことを検証する factory。
struct CountingFactory {
    stop_calls: Arc<AtomicUsize>,
    state: Arc<AppState>,
}

impl WatcherFactory for CountingFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let stop_calls = Arc::clone(&self.stop_calls);
        let state = Arc::clone(&self.state);
        stage_test_resources(
            identity,
            || {},
            move || {
                let snapshot = state.test_tasks_snapshot().expect("new session readable");
                assert_eq!(1, snapshot.len());
                assert_eq!("tasks/a.md", snapshot[0].file_path);
                stop_calls.fetch_add(1, Ordering::SeqCst);
            },
        )
    }
}

fn write_md(root: &Path, rel: &str, body: &str) {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).expect("create parent dir");
    }
    fs::write(&absolute, body).expect("write md");
}

fn task_md(title: &str, status: &str, parent: Option<&str>) -> String {
    let mut s = String::from("---\n");
    s.push_str(&format!("title: {title}\n"));
    s.push_str(&format!("status: {status}\n"));
    if let Some(p) = parent {
        s.push_str(&format!("parent: {p}\n"));
    }
    s.push_str("---\n\nbody\n");
    s
}

fn task_md_with_milestone(
    title: &str,
    status: &str,
    parent: Option<&str>,
    milestone: &str,
) -> String {
    let mut s = String::from("---\n");
    s.push_str(&format!("title: {title}\n"));
    s.push_str(&format!("status: {status}\n"));
    s.push_str(&format!("milestone: \"{milestone}\"\n"));
    if let Some(parent) = parent {
        s.push_str(&format!("parent: {parent}\n"));
    }
    s.push_str("---\n\nbody\n");
    s
}

fn write_config_json(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join("config.json"), content).expect("write config.json");
}

struct PanickingStopFactory;

impl WatcherFactory for PanickingStopFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        stage_test_resources(identity, || {}, || panic!("watcher stop panic for test"))
    }
}

#[derive(Default)]
struct CollectingStopReporter {
    diagnostics: Mutex<Vec<WatcherStopDiagnostic>>,
}

impl WatcherStopDiagnosticReporter for CollectingStopReporter {
    fn report(&self, diagnostic: WatcherStopDiagnostic) {
        self.diagnostics
            .lock()
            .expect("diagnostics writable")
            .push(diagnostic);
    }
}
struct FailingStageFactory;

impl WatcherFactory for FailingStageFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        _identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        Err(OpenProjectError::WatcherInitFailed {
            source: WatcherError::Init("synthetic stage failure".to_owned()),
        })
    }
}

struct IdentityMismatchFactory;

impl WatcherFactory for IdentityMismatchFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let wrong_id =
            crate::project_session::SessionId::from_raw(identity.version().session_id.as_u64() + 1);
        let wrong_identity = crate::project_session::PreparedProjectSession::new(
            identity.project_root().clone(),
            Config::default(),
            crate::config::LabelRegistry::default(),
            crate::config::MilestoneRegistry::default(),
            std::collections::HashMap::new(),
        )
        .into_session(wrong_id)
        .identity();
        stage_test_resources(wrong_identity, || {}, || {})
    }
}

struct ActivationProbeFactory {
    processed: Arc<AtomicUsize>,
    completed: mpsc::Sender<()>,
}

impl WatcherFactory for ActivationProbeFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let activation_state = pending_activation_state();
        let worker_state = Arc::clone(&activation_state);
        let processed = Arc::clone(&self.processed);
        let completed = self.completed.clone();
        let (ready_tx, ready_rx) = mpsc::channel();
        let join = thread::Builder::new()
            .name("open-test-activation-probe".to_owned())
            .spawn(move || {
                ready_tx.send(()).expect("signal worker ready");
                if wait_for_activation(worker_state.as_ref()) {
                    processed.fetch_add(1, Ordering::SeqCst);
                    completed.send(()).expect("signal worker processed");
                }
            })
            .map_err(WatcherError::Io)
            .map_err(|source| OpenProjectError::WatcherInitFailed { source })?;
        ready_rx.recv().expect("worker reached activation latch");
        assert_eq!(
            0,
            self.processed.load(Ordering::SeqCst),
            "paused worker must not process before swap"
        );
        let activation = WatcherActivation::new(activation_state, join.thread().clone());
        let handle = TestPausedHandle {
            join: Some(join),
            on_stop: Some(Box::new(|| {})),
        };

        Ok(StagedProjectResources::new(
            identity,
            Box::new(handle) as BoxedWatcherHandle,
            activation,
            Arc::new(WriteIgnoreRegistry::new()),
        ))
    }
}

struct BlockingStopFactory {
    stop_started: mpsc::Sender<()>,
    release_stop: Mutex<Option<mpsc::Receiver<()>>>,
}

impl WatcherFactory for BlockingStopFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let stop_started = self.stop_started.clone();
        let release_stop = self
            .release_stop
            .lock()
            .expect("release receiver available")
            .take()
            .expect("stage called once");
        stage_test_resources(
            identity,
            || {},
            move || {
                stop_started.send(()).expect("signal stop started");
                release_stop.recv().expect("release blocked stop");
            },
        )
    }
}

#[test]
fn returns_directory_not_found_for_missing_path() {
    let state = Arc::new(AppState::new());
    // TempDir 配下に未作成のサブディレクトリを作って、確実に NotFound 入力を生成する。
    let dir = tempdir();
    let missing_path = dir.path().join("does-not-exist").join("project");
    let missing = missing_path.to_str().expect("utf-8 path");

    let err = open_with_noop(Arc::clone(&state), missing).expect_err("missing path should fail");

    match err {
        OpenProjectError::DirectoryNotFound { ref path } => {
            assert_eq!(missing, path);
        }
        other => panic!("expected DirectoryNotFound, got {other:?}"),
    }
    let display = err.to_string();
    assert!(display.contains("ディレクトリが見つかりません"));
    assert!(display.contains(missing));
}

#[test]
fn returns_not_a_directory_for_file_path() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let file_path = dir.path().join("regular.txt");
    fs::write(&file_path, "hello").expect("write file");
    let raw = file_path.to_str().expect("utf-8 path");

    let err = open_with_noop(Arc::clone(&state), raw).expect_err("file path should fail");

    match err {
        OpenProjectError::NotADirectory { ref path } => assert_eq!(raw, path),
        other => panic!("expected NotADirectory, got {other:?}"),
    }
    assert!(err.to_string().contains("ディレクトリではありません"));
}

#[cfg(unix)]
#[test]
fn returns_permission_denied_for_inaccessible_directory() {
    use std::os::unix::fs::PermissionsExt;

    // root として実行されると 0o000 でもアクセスできてしまうため skip。
    if unsafe { libc_geteuid() } == 0 {
        return;
    }

    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let target = dir.path().join("locked");
    fs::create_dir(&target).expect("create dir");
    let mut perms = fs::metadata(&target).expect("metadata").permissions();
    perms.set_mode(0o000);
    fs::set_permissions(&target, perms).expect("chmod");

    let raw = target.to_str().expect("utf-8 path").to_string();
    let err = open_with_noop(Arc::clone(&state), &raw).expect_err("inaccessible dir should fail");

    // 権限を戻して TempDir のドロップを成功させる。
    let mut restore = fs::metadata(&target).expect("metadata").permissions();
    restore.set_mode(0o755);
    let _ = fs::set_permissions(&target, restore);

    match err {
        OpenProjectError::PermissionDenied { ref path } => {
            assert_eq!(&raw, path);
        }
        other => panic!("expected PermissionDenied, got {other:?}"),
    }
    assert!(err.to_string().contains("ディレクトリにアクセスできません"));
}

#[cfg(unix)]
extern "C" {
    fn geteuid() -> u32;
}

#[cfg(unix)]
unsafe fn libc_geteuid() -> u32 {
    geteuid()
}

#[test]
fn empty_directory_returns_default_columns_and_no_tasks() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8 path").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("empty dir should succeed");

    assert!(payload.tasks.is_empty());
    let default_columns: Vec<String> = Config::default()
        .columns
        .iter()
        .map(|c| c.name.as_str().to_string())
        .collect();
    let payload_columns: Vec<String> = payload
        .columns
        .iter()
        .map(|c| c.as_str().to_string())
        .collect();
    assert_eq!(default_columns, payload_columns);
}

#[test]
fn tasks_are_sorted_by_id_and_children_are_built() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Todo", Some("tasks/b.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/a.md", "tasks/b.md"], ids);

    let task_b = payload
        .tasks
        .iter()
        .find(|t| t.id == "tasks/b.md")
        .expect("task b exists");
    assert_eq!(vec!["tasks/a.md".to_string()], task_b.children);
}

#[test]
fn loads_user_config_when_available() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Backlog", "order": 0 },
            { "name": "Doing",   "order": 1 },
            { "name": "Shipped", "order": 2 }
        ],
        "cardOrder": {}
    }"#;
    write_config_json(dir.path(), config_json);
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(
        vec![
            "Backlog".to_string(),
            "Doing".to_string(),
            "Shipped".to_string()
        ],
        payload.columns
    );
}

#[test]
fn columns_sorted_by_order_irrespective_of_input_array_order() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "C", "order": 2 },
            { "name": "A", "order": 0 },
            { "name": "B", "order": 1 }
        ],
        "cardOrder": {}
    }"#;
    write_config_json(dir.path(), config_json);
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(
        vec!["A".to_string(), "B".to_string(), "C".to_string()],
        payload.columns
    );
}

// ───────── config bootstrap（config 不在時の生成・保存） ─────────

/// `.spec-board/config.json` を読み、保存された Config として解釈する。
fn read_saved_config(root: &Path) -> Config {
    let raw = fs::read_to_string(root.join(".spec-board").join("config.json"))
        .expect("config.json should exist");
    serde_json::from_str(&raw).expect("saved config.json should parse")
}

/// config の書き込みだけ差し替えて開く。書き込み失敗時の fallback 検証に使う。
fn open_with_config_writer(
    state: Arc<AppState>,
    path: &str,
    config_writer: &dyn ConfigWriter,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let intent = OpenProjectIntent::try_from(path.to_string())?;
    let labels_store = crate::config::label_registry_store(intent.as_path());
    let milestones_store = crate::config::milestone_registry_store(intent.as_path());
    open_project_impl_with_reporter(
        &state,
        &intent,
        ProjectDataPorts {
            labels_store: &labels_store,
            milestones_store: &milestones_store,
            config_writer,
        },
        &NoopWatcherFactory,
        &LogWatcherStopDiagnosticReporter,
        &NoopReactivationScheduler,
    )
}

/// 常に書き込みへ失敗する `ConfigWriter`。
struct FailingConfigWriter;

impl ConfigWriter for FailingConfigWriter {
    fn write_atomic(&self, _dst: &Path, _content: &str) -> std::io::Result<()> {
        Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "config write denied",
        ))
    }
}

/// 本番と同じ書き込みを行いつつ、呼ばれた回数を数える `ConfigWriter`。
#[derive(Default)]
struct CountingConfigWriter {
    calls: AtomicUsize,
}

impl CountingConfigWriter {
    fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

impl ConfigWriter for CountingConfigWriter {
    fn write_atomic(&self, dst: &Path, content: &str) -> std::io::Result<()> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        FsConfigWriter.write_atomic(dst, content)
    }
}

#[test]
fn bootstrap_generates_columns_from_task_statuses() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(dir.path(), "tasks/c.md", &task_md("C", "Done", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(
        vec!["Doing".to_string(), "Todo".to_string(), "Done".to_string()],
        payload.columns
    );
    let saved = read_saved_config(dir.path());
    let saved_columns: Vec<&str> = saved.columns.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(vec!["Doing", "Todo", "Done"], saved_columns);
    assert_eq!(saved.done_column.as_deref(), Some("Done"));
}

#[test]
fn bootstrap_persisted_config_is_reused_on_reopen() {
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let first = open_with_noop(Arc::new(AppState::new()), &raw).expect("first open");
    let after_first = fs::read(dir.path().join(".spec-board").join("config.json"))
        .expect("config.json should exist after the first open");

    // 別 AppState から開き直してキャッシュを経由させない（= コールドオープン）。
    let second = open_with_noop(Arc::new(AppState::new()), &raw).expect("second open");
    let after_second = fs::read(dir.path().join(".spec-board").join("config.json"))
        .expect("config.json should still exist");

    assert_eq!(first.columns, second.columns);
    assert_eq!(after_first, after_second);
}

#[test]
fn reopen_keeps_status_less_task_in_the_same_column() {
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    write_md(dir.path(), "tasks/b.md", "---\ntitle: B\n---\n\nbody\n");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let first = open_with_noop(Arc::new(AppState::new()), &raw).expect("first open");
    let second = open_with_noop(Arc::new(AppState::new()), &raw).expect("second open");

    // 生成 config の既定 status は order 最小の `Doing`。初回オープンの時点で
    // それを反映しないと、2 回目にカードが別カラムへ移って見える。
    assert_eq!("Doing", status_of(&first, "tasks/b.md"));
    assert_eq!("Doing", status_of(&second, "tasks/b.md"));
    assert_eq!(vec!["Doing".to_string(), "Todo".to_string()], first.columns);
    assert_eq!(first.columns, second.columns);
}

/// payload から指定 id のタスクの status を取り出す。
fn status_of(payload: &OpenProjectPayload, id: &str) -> String {
    payload
        .tasks
        .iter()
        .find(|task| task.id == id)
        .expect("task exists")
        .status
        .as_str()
        .to_owned()
}

#[test]
fn bootstrap_deduplicates_repeated_status() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Doing", None));
    write_md(dir.path(), "tasks/c.md", &task_md("C", "Doing", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(vec!["Doing".to_string()], payload.columns);
}

#[test]
fn bootstrap_writes_default_config_for_empty_directory() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let default_columns: Vec<String> = Config::default()
        .columns
        .iter()
        .map(|c| c.name.as_str().to_string())
        .collect();
    let payload_columns: Vec<String> = payload
        .columns
        .iter()
        .map(|c| c.as_str().to_string())
        .collect();
    assert_eq!(default_columns, payload_columns);
    assert_eq!(Config::default(), read_saved_config(dir.path()));
}

#[test]
fn existing_config_is_not_overwritten_by_bootstrap() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Backlog", "order": 0 }
        ],
        "cardOrder": {}
    }"#;
    write_config_json(dir.path(), config_json);
    // status は既存カラムに合わせる。未知 status を置くと reconcile が末尾へ
    // カラムを足すため、bootstrap による上書きの有無を切り分けられなくなる。
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Backlog", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let before = fs::read(dir.path().join(".spec-board").join("config.json")).expect("read config");

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(vec!["Backlog".to_string()], payload.columns);
    let after = fs::read(dir.path().join(".spec-board").join("config.json")).expect("read config");
    assert_eq!(before, after);
}

#[test]
fn config_write_failure_falls_back_to_default_columns_with_warning() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_config_writer(Arc::clone(&state), &raw, &FailingConfigWriter)
        .expect("config write failure must not fail the open");

    let default_columns: Vec<String> = Config::default()
        .columns
        .iter()
        .map(|c| c.name.as_str().to_string())
        .collect();
    let payload_columns: Vec<String> = payload
        .columns
        .iter()
        .map(|c| c.as_str().to_string())
        .collect();
    assert_eq!(default_columns, payload_columns);
    assert_eq!(1, payload.load_warnings.len());
    assert_eq!(
        crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback,
        payload.load_warnings[0].code
    );
    assert!(!dir.path().join(".spec-board").join("config.json").exists());
}

#[test]
fn broken_config_is_not_replaced_by_bootstrap() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let broken = "{ this is not json";
    write_config_json(dir.path(), broken);
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should fall back and succeed");

    let default_columns: Vec<String> = Config::default()
        .columns
        .iter()
        .map(|c| c.name.as_str().to_string())
        .collect();
    let payload_columns: Vec<String> = payload
        .columns
        .iter()
        .map(|c| c.as_str().to_string())
        .collect();
    assert_eq!(default_columns, payload_columns);
    assert!(payload.load_warnings.iter().any(|warning| {
        warning.code == crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback
    }));
    let on_disk = fs::read_to_string(dir.path().join(".spec-board").join("config.json"))
        .expect("config.json should still exist");
    assert_eq!(broken, on_disk);
}

#[test]
fn bootstrap_keeps_status_unnormalized() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "\"  Todo  \"", None),
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(
        vec!["  Todo  ".to_string(), "Todo".to_string()],
        payload.columns
    );
}

#[test]
fn bootstrap_uses_default_status_for_tasks_without_status() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", "---\ntitle: A\n---\n\nbody\n");
    write_md(dir.path(), "tasks/b.md", "---\ntitle: B\n---\n\nbody\n");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(vec!["Todo".to_string()], payload.columns);
}

#[test]
fn cache_hit_reopen_does_not_bootstrap_the_config_again() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_md(dir_a.path(), "tasks/a.md", &task_md("A", "Doing", None));
    let raw_a = dir_a.path().to_str().expect("utf-8").to_string();
    let raw_b = dir_b.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    open_with_config_writer(Arc::clone(&state), &raw_a, &writer).expect("cold open A");
    open_with_config_writer(Arc::clone(&state), &raw_b, &writer).expect("cold open B");
    let calls_before_reopen = writer.calls();
    let reopened = open_with_config_writer(Arc::clone(&state), &raw_a, &writer).expect("reopen A");

    assert_eq!(vec!["Doing".to_string()], reopened.columns);
    assert_eq!(
        calls_before_reopen,
        writer.calls(),
        "差分が無ければ config を書き直さない"
    );
}

#[test]
fn writes_guide_markdown_to_disk() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let guide = dir.path().join(".spec-board").join("GUIDE.md");
    assert!(guide.exists(), "GUIDE.md should be created");
    let body = fs::read_to_string(&guide).expect("read GUIDE");
    assert!(body.contains("Todo"));
}

#[test]
fn updates_app_state_fields_on_success() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    assert_eq!(
        Some(dir.path().to_path_buf()),
        state.test_project_root().expect("readable")
    );
    // config 不在なので、置いた 1 件の status から生成された config が state に入る。
    let cfg = state.test_config().expect("readable").expect("config set");
    let column_names: Vec<&str> = cfg.columns.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(vec!["Todo"], column_names);
    let snapshot = state.test_tasks_snapshot().expect("readable");
    assert_eq!(1, snapshot.len());
    assert_eq!("tasks/a.md", snapshot[0].file_path);
    let identity = state.active_session_identity().expect("active session");
    let resources = state
        .resources_for(identity.version())
        .expect("matching active resources");
    assert_eq!(identity.version(), resources.version());
}

#[test]
fn config_load_failure_for_invalid_json_falls_back_with_warning() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(dir.path(), "{ this is not json");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw)
        .expect("invalid config should fall back to the default config");

    assert_eq!(Config::default().columns.len(), payload.columns.len());
    assert_eq!(1, payload.load_warnings.len());
    assert_eq!(
        crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback,
        payload.load_warnings[0].code
    );
    assert_eq!(
        crate::project::load_warning::ProjectLoadWarningStage::Config,
        payload.load_warnings[0].stage
    );
    assert_eq!(
        Some(".spec-board/config.json"),
        payload.load_warnings[0].path.as_deref()
    );
}

#[test]
fn config_load_failure_for_empty_columns_falls_back_with_warning() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{ "version": 1, "columns": [], "cardOrder": {} }"#;
    write_config_json(dir.path(), config_json);
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw)
        .expect("invalid config validation should fall back to defaults");

    assert_eq!(
        Config::default().columns,
        state.test_config().expect("readable").unwrap().columns
    );
    assert!(payload.load_warnings.iter().any(|warning| {
        warning.code == crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback
            && warning.stage == crate::project::load_warning::ProjectLoadWarningStage::Config
    }));
}

#[test]
fn registry_load_failure_remains_fatal_when_spec_board_path_is_a_file() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let spec_path = dir.path().join(".spec-board");
    fs::write(&spec_path, "not a directory").expect("write file at .spec-board");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let err =
        open_with_noop(Arc::clone(&state), &raw).expect_err("registry load should remain fatal");

    match err {
        OpenProjectError::LabelsLoadFailed { category, .. } => {
            assert_eq!("io", category);
        }
        other => panic!("expected LabelsLoadFailed io, got {other:?}"),
    }
}

#[test]
fn parent_cycle_returns_scan_success_with_warnings() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    // a -> b -> a の循環。scan は成功し、A・B 両方に parentCycle warning が付く。
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Todo", Some("tasks/b.md")),
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", "Todo", Some("tasks/a.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("cycle should not error");

    let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(ids, vec!["tasks/a.md", "tasks/b.md"]);

    for task in &payload.tasks {
        assert!(
            task.warnings.iter().any(|w| {
                w.code == crate::task::warning::TaskWarningCode::ParentCycle
                    && w.field.as_deref() == Some("parent")
            }),
            "{} should have parentCycle warning",
            task.file_path.as_str()
        );
        assert!(
            task.parent.is_none(),
            "{} parent should be cleared by cycle warning",
            task.file_path.as_str()
        );
    }
}

#[test]
fn corrupted_md_files_are_skipped_and_command_succeeds() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    // 通常の md
    write_md(dir.path(), "tasks/ok.md", &task_md("OK", "Todo", None));
    // frontmatter のない md（task_from_markdown で NotTask）
    write_md(dir.path(), "tasks/nofm.md", "no frontmatter here\n");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/ok.md"], ids);
}

#[test]
fn reopen_stops_previous_active_watcher_exactly_once() {
    let state = Arc::new(AppState::new());
    let counter = Arc::new(AtomicUsize::new(0));
    let first_dir = tempdir();
    let second_dir = tempdir();
    write_md(second_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let factory = CountingFactory {
        stop_calls: Arc::clone(&counter),
        state: Arc::clone(&state),
    };

    open_with(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("first open");
    open_with_noop(
        Arc::clone(&state),
        second_dir.path().to_str().expect("utf-8"),
    )
    .expect("reopen");

    assert_eq!(1, counter.load(Ordering::SeqCst));
}

#[test]
fn reopen_installs_a_fresh_session_scoped_write_ignore_registry() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    open_with_noop(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
    )
    .expect("first open");
    let first_identity = state.active_session_identity().expect("first identity");
    let first_resources = state
        .resources_for(first_identity.version())
        .expect("first resources");
    first_resources
        .write_ignore()
        .register("tasks/dirty.md")
        .expect("register old session path");

    let second_dir = tempdir();
    open_with_noop(
        Arc::clone(&state),
        second_dir.path().to_str().expect("utf-8"),
    )
    .expect("reopen");
    let second_identity = state.active_session_identity().expect("second identity");
    let second_resources = state
        .resources_for(second_identity.version())
        .expect("second resources");

    assert!(second_resources
        .write_ignore()
        .is_empty()
        .expect("readable"));
    assert!(
        first_resources
            .write_ignore()
            .should_ignore("tasks/dirty.md")
            .expect("old registry readable"),
        "session registries are isolated rather than globally cleared"
    );
}

#[test]
fn watcher_stop_panic_is_reported_without_rolling_back_new_session() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    let first = open_with(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
        &PanickingStopFactory,
    )
    .expect("first open");

    let second_dir = tempdir();
    let second_raw = second_dir.path().to_str().expect("utf-8").to_owned();
    let intent = OpenProjectIntent::try_from(second_raw).expect("intent");
    let reporter = CollectingStopReporter::default();
    let second = open_project_impl_with_reporter(
        &state,
        &intent,
        ProjectDataPorts {
            labels_store: &crate::config::label_registry_store(intent.as_path()),
            milestones_store: &crate::config::milestone_registry_store(intent.as_path()),
            config_writer: &FsConfigWriter,
        },
        &NoopWatcherFactory,
        &reporter,
        &NoopReactivationScheduler,
    )
    .expect("stop panic must not fail reopen");

    assert_eq!(
        second_dir.path(),
        state
            .test_project_root()
            .expect("readable")
            .expect("active root")
    );
    assert!(second.session.generation > first.session.generation);
    let diagnostics = reporter.diagnostics.lock().expect("diagnostics readable");
    assert_eq!(1, diagnostics.len());
    assert_eq!(
        first.session.generation.as_u64(),
        diagnostics[0].version.session_id.as_u64()
    );
    assert_eq!("watcher stop panic for test", diagnostics[0].panic_message);
}

#[test]
fn tasks_cache_uses_path_buf_keys_from_file_path() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::clone(&state), &raw).expect("should succeed");

    let snapshot = state.test_tasks_snapshot().expect("readable");
    let mut paths: Vec<String> = snapshot
        .iter()
        .map(|t| t.file_path.as_str().to_string())
        .collect();
    paths.sort();
    assert_eq!(
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
        paths
    );
}

#[test]
fn watcher_init_failure_keeps_app_state_completely_unchanged() {
    // 1 回目の open で AppState を確定させる。
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    write_md(first_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let first_raw = first_dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &first_raw).expect("first open");

    let project_before = state.test_project_root().expect("readable");
    let config_before = state.test_config().expect("readable");
    let snapshot_before = state.test_tasks_snapshot().expect("readable");

    let identity_before = state.active_session_identity().expect("active identity");
    // 2 回目: prepare で WatcherInitFailed を返すスタブを使う。
    let other_dir = tempdir();
    let other_raw = other_dir.path().to_str().expect("utf-8").to_string();
    let intent = OpenProjectIntent::try_from(other_raw.clone()).expect("non-empty path");
    let factory = FailingPrepareFactory::new("synthetic init failure");
    let err = open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &factory,
    )
    .expect_err("watcher init failure should be returned");
    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));

    // AppState の全フィールドが 1 回目の状態のまま残ることを確認する。
    assert_eq!(project_before, state.test_project_root().expect("readable"));
    assert_eq!(config_before, state.test_config().expect("readable"));
    let snapshot_after = state.test_tasks_snapshot().expect("readable");
    assert_eq!(snapshot_before.len(), snapshot_after.len());
    assert_eq!(
        identity_before,
        state.active_session_identity().expect("identity preserved")
    );
    state
        .resources_for(identity_before.version())
        .expect("resources preserved");
}

#[test]
fn watcher_init_failure_does_not_write_guide_md_in_new_dir() {
    // prepare が GUIDE.md 書き込みより前に呼ばれる契約を担保する。
    // watcher 初期化失敗時に新 dir 配下の `.spec-board/GUIDE.md` が副作用
    // として残らないことを確認する。
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let intent = OpenProjectIntent::try_from(raw.clone()).expect("non-empty path");
    let factory = FailingPrepareFactory::new("synthetic init failure");
    let err = open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &factory,
    )
    .expect_err("watcher init failure");
    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));

    let guide = dir.path().join(".spec-board").join("GUIDE.md");
    assert!(
        !guide.exists(),
        "GUIDE.md should not be written when watcher init fails"
    );
}

#[test]
fn watcher_init_failure_does_not_invoke_active_watcher_stop() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    open_with(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
        &PanickingStopFactory,
    )
    .expect("first open");
    let identity_before = state.active_session_identity().expect("active identity");

    let second_dir = tempdir();
    let second_raw = second_dir.path().to_str().expect("utf-8").to_owned();
    let intent = OpenProjectIntent::try_from(second_raw).expect("intent");
    let factory = FailingPrepareFactory::new("synth");
    let err = open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &factory,
    )
    .expect_err("watcher init failure");

    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));
    assert_eq!(
        identity_before,
        state.active_session_identity().expect("identity preserved")
    );
}

#[test]
fn displaced_watcher_stop_observes_the_new_committed_session() {
    let state = Arc::new(AppState::new());
    let stop_counter = Arc::new(AtomicUsize::new(0));
    let first_dir = tempdir();
    let factory = CountingFactory {
        stop_calls: Arc::clone(&stop_counter),
        state: Arc::clone(&state),
    };
    open_with(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("first open");

    let second_dir = tempdir();
    write_md(second_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    open_with_noop(
        Arc::clone(&state),
        second_dir.path().to_str().expect("utf-8"),
    )
    .expect("reopen");

    assert_eq!(1, stop_counter.load(Ordering::SeqCst));
}

#[test]
fn project_state_is_replaced_when_config_falls_back() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    write_md(first_dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    open_with_noop(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
    )
    .expect("first open should succeed");

    let bad_dir = tempdir();
    write_config_json(bad_dir.path(), "{ this is not json");
    let payload = open_with_noop(Arc::clone(&state), bad_dir.path().to_str().expect("utf-8"))
        .expect("config failure should not prevent opening the project");

    assert_eq!(
        Some(bad_dir.path().to_path_buf()),
        state.test_project_root().expect("readable")
    );
    assert!(state.test_tasks_snapshot().expect("readable").is_empty());
    assert!(payload.load_warnings.iter().any(|warning| {
        warning.code == crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback
    }));
}

#[test]
fn payload_serialization_uses_camel_case() {
    let payload = OpenProjectPayload {
        tasks: Vec::new(),
        columns: vec!["Todo".into()],
        projections: TaskProjectionMap::new(),
        milestone_projections: MilestoneProjectionMap::new(),
        task_tree: TaskForest::new(),
        load_warnings: Vec::new(),
        session: zero_session(),
    };
    let json = serde_json::to_string(&payload).expect("serialize");
    assert!(json.contains("\"tasks\""));
    assert!(json.contains("\"columns\""));
    assert!(json.contains("\"projections\""));
    assert!(json.contains("\"milestoneProjections\""));
    assert!(json.contains("\"taskTree\""));
    assert!(json.contains("\"session\""));
}

#[test]
fn build_payload_returns_empty_columns_for_config_with_no_columns() {
    let cfg = Config {
        version: 1,
        columns: Vec::new(),
        card_order: CardOrder::default(),
        done_column: None,
    };

    let payload = super::build_payload_from_parts(Vec::new(), &cfg, zero_session());

    assert!(payload.tasks.is_empty());
    assert!(payload.columns.is_empty());
}

#[test]
fn build_payload_sorts_tasks_by_id_and_columns_by_order() {
    let cfg = Config {
        version: 1,
        columns: vec![
            Column {
                name: "Z".into(),
                order: 2,
                color: None,
                wip_limit: None,
            },
            Column {
                name: "A".into(),
                order: 0,
                color: None,
                wip_limit: None,
            },
            Column {
                name: "M".into(),
                order: 1,
                color: None,
                wip_limit: None,
            },
        ],
        card_order: CardOrder::default(),
        done_column: None,
    };
    let task_b = Task {
        draft: false,
        id: "b.md".into(),
        file_path: "b.md".into(),
        title: "B".into(),
        status: "A".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    };
    let task_a = Task {
        id: "a.md".into(),
        file_path: "a.md".into(),
        ..task_b.clone()
    };

    let payload = super::build_payload_from_parts(vec![task_b, task_a], &cfg, zero_session());

    let task_ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["a.md", "b.md"], task_ids);
    assert_eq!(
        vec!["A".to_string(), "M".to_string(), "Z".to_string()],
        payload.columns
    );
}

#[test]
fn open_project_payload_round_trip() {
    use serde::Deserialize;
    // OpenProjectPayload は #[derive(Serialize)] のみだが、JSON 形状互換を
    // round-trip で機械検証する。Deserialize を派生せずに `serde_json::Value`
    // 経由で再パースする。
    let json = r#"{"tasks":[],"columns":["Todo","Done"],"projections":{},"milestoneProjections":{},"loadWarnings":[]}"#;
    #[derive(Debug, Deserialize, PartialEq)]
    #[serde(rename_all = "camelCase")]
    struct PayloadShape {
        tasks: Vec<serde_json::Value>,
        columns: Vec<String>,
        projections: serde_json::Map<String, serde_json::Value>,
        milestone_projections: serde_json::Map<String, serde_json::Value>,
        load_warnings: Vec<serde_json::Value>,
    }
    let parsed: PayloadShape = serde_json::from_str(json).unwrap();
    assert_eq!(parsed.tasks.len(), 0);
    assert_eq!(parsed.columns, vec!["Todo".to_string(), "Done".to_string()]);
    assert!(parsed.projections.is_empty());
    assert!(parsed.milestone_projections.is_empty());

    // 反対方向: ColumnName VO の serde_transparent で文字列に戻ることを確認。
    let payload = OpenProjectPayload {
        tasks: vec![],
        columns: vec!["Todo".into(), "Done".into()],
        projections: TaskProjectionMap::new(),
        milestone_projections: MilestoneProjectionMap::new(),
        task_tree: TaskForest::new(),
        load_warnings: Vec::new(),
        session: zero_session(),
    };
    let serialized = serde_json::to_string(&payload).unwrap();
    assert_eq!(
        serialized,
        r#"{"tasks":[],"columns":["Todo","Done"],"projections":{},"milestoneProjections":{},"taskTree":[],"loadWarnings":[],"session":{"projectKey":"/tmp/project","generation":0,"revision":0,"eventSeq":0}}"#
    );
}

// ───────── labels.yml 読み込み（open_project 経由） ─────────

fn write_labels_yml(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join("labels.yml"), content).expect("write labels.yml");
}

#[test]
fn open_commits_labels_from_labels_yml() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_labels_yml(
        dir.path(),
        "labels:\n  - name: bug\n    color: \"#D73A4A\"\n  - name: enhancement\n",
    );

    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("open should succeed");

    let registry = state
        .test_labels()
        .expect("readable")
        .expect("labels committed");
    let names: Vec<&str> = registry.labels.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, vec!["bug", "enhancement"]);
}

#[test]
fn open_without_labels_yml_commits_empty_registry() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));

    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("open should succeed");

    let registry = state
        .test_labels()
        .expect("readable")
        .expect("labels committed (default)");
    assert!(registry.labels.is_empty());
}

#[test]
fn open_fails_with_parse_category_for_broken_labels_yml() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_labels_yml(dir.path(), "labels:\n  - name: bug\n  invalid: : :\n");

    let err = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect_err("broken labels.yml should fail open");
    assert!(
        matches!(
            err,
            OpenProjectError::LabelsLoadFailed {
                category: "parse",
                ..
            }
        ),
        "got {err:?}"
    );
    assert!(err.to_string().contains("labels load failed (parse)"));
}

#[test]
fn open_fails_with_parse_category_for_duplicate_label_name() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_labels_yml(dir.path(), "labels:\n  - name: bug\n  - name: bug\n");

    let err = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect_err("duplicate name should fail open");
    assert!(
        matches!(
            err,
            OpenProjectError::LabelsLoadFailed {
                category: "parse",
                ..
            }
        ),
        "got {err:?}"
    );
}

#[test]
fn reopen_into_project_without_labels_yml_resets_labels_to_empty() {
    let state = Arc::new(AppState::new());

    // 1 回目: labels.yml ありのプロジェクト
    let dir1 = tempdir();
    write_labels_yml(dir1.path(), "labels:\n  - name: bug\n");
    open_with_noop(Arc::clone(&state), dir1.path().to_str().expect("utf-8"))
        .expect("first open should succeed");
    assert_eq!(
        1,
        state
            .test_labels()
            .expect("readable")
            .expect("some")
            .labels
            .len()
    );

    // 2 回目: labels.yml 不在の別プロジェクト → 旧 labels が残らず Default(空) へ置換
    let dir2 = tempdir();
    open_with_noop(Arc::clone(&state), dir2.path().to_str().expect("utf-8"))
        .expect("second open should succeed");
    assert!(state
        .test_labels()
        .expect("readable")
        .expect("some")
        .labels
        .is_empty());
}

#[test]
fn failed_open_due_to_broken_labels_keeps_previous_state() {
    let state = Arc::new(AppState::new());

    // 1 回目: 正常プロジェクト
    let dir1 = tempdir();
    write_md(dir1.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_labels_yml(dir1.path(), "labels:\n  - name: bug\n");
    open_with_noop(Arc::clone(&state), dir1.path().to_str().expect("utf-8"))
        .expect("first open should succeed");
    let project_before = state.test_project_root().expect("readable");
    let labels_before = state.test_labels().expect("readable");

    // 2 回目: 壊れ labels.yml の別プロジェクト → load は commit より前なので旧 state 非破壊
    let dir2 = tempdir();
    write_labels_yml(dir2.path(), "labels:\n  - name: bug\n  invalid: : :\n");
    let err = open_with_noop(Arc::clone(&state), dir2.path().to_str().expect("utf-8"))
        .expect_err("broken labels.yml should fail open");
    assert!(matches!(err, OpenProjectError::LabelsLoadFailed { .. }));

    assert_eq!(project_before, state.test_project_root().expect("readable"));
    assert_eq!(labels_before, state.test_labels().expect("readable"));
}

// ───────── milestones.yml 読み込み（open_project 経由） ─────────

fn write_milestones_yml(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join("milestones.yml"), content).expect("write milestones.yml");
}

#[test]
fn open_commits_milestones_from_milestones_yml() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_milestones_yml(
        dir.path(),
        "milestones:\n  - name: v0.3\n    title: v0.3 リリース\n  - name: v0.4\n",
    );

    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("open should succeed");

    let registry = state
        .test_milestones()
        .expect("readable")
        .expect("milestones committed");
    let names: Vec<&str> = registry
        .milestones
        .iter()
        .map(|m| m.name.as_str())
        .collect();
    assert_eq!(names, vec!["v0.3", "v0.4"]);
}

#[test]
fn open_without_milestones_yml_commits_empty_registry() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));

    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("open should succeed");

    let registry = state
        .test_milestones()
        .expect("readable")
        .expect("milestones committed (default)");
    assert!(registry.milestones.is_empty());
}

#[test]
fn open_fails_with_parse_category_for_broken_milestones_yml() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    // ルートが sequence（mapping 以外）→ 構造不正
    write_milestones_yml(dir.path(), "- v0.3\n- v0.4\n");

    let err = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect_err("broken milestones.yml should fail open");
    assert!(
        matches!(
            err,
            OpenProjectError::MilestonesLoadFailed {
                category: "parse",
                ..
            }
        ),
        "got {err:?}"
    );
    assert!(err.to_string().contains("milestones load failed (parse)"));
}

#[test]
fn open_fails_with_parse_category_for_duplicate_milestone_name() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_milestones_yml(dir.path(), "milestones:\n  - name: v0.3\n  - name: v0.3\n");

    let err = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect_err("duplicate name should fail open");
    assert!(
        matches!(
            err,
            OpenProjectError::MilestonesLoadFailed {
                category: "parse",
                ..
            }
        ),
        "got {err:?}"
    );
}

#[test]
fn open_commits_config_labels_and_milestones_together() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_labels_yml(dir.path(), "labels:\n  - name: bug\n");
    write_milestones_yml(dir.path(), "milestones:\n  - name: v0.3\n");

    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("open should succeed");

    // config / labels / milestones が一貫して反映される
    assert!(state.test_config().expect("readable").is_some());
    assert_eq!(
        1,
        state
            .test_labels()
            .expect("readable")
            .expect("some")
            .labels
            .len()
    );
    assert_eq!(
        1,
        state
            .test_milestones()
            .expect("readable")
            .expect("some")
            .milestones
            .len()
    );
}

#[test]
fn reopen_into_project_without_milestones_yml_resets_to_empty() {
    let state = Arc::new(AppState::new());

    let dir1 = tempdir();
    write_milestones_yml(dir1.path(), "milestones:\n  - name: v0.3\n");
    open_with_noop(Arc::clone(&state), dir1.path().to_str().expect("utf-8"))
        .expect("first open should succeed");
    assert_eq!(
        1,
        state
            .test_milestones()
            .expect("readable")
            .expect("some")
            .milestones
            .len()
    );

    let dir2 = tempdir();
    open_with_noop(Arc::clone(&state), dir2.path().to_str().expect("utf-8"))
        .expect("second open should succeed");
    assert!(state
        .test_milestones()
        .expect("readable")
        .expect("some")
        .milestones
        .is_empty());
}

#[test]
fn payload_tasks_follow_saved_card_order_within_each_column() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(dir.path(), "tasks/c.md", &task_md("C", "Todo", None));
    // 保存済みの並びは id 昇順とは逆。id 順で返してしまうと復元されない。
    write_config_json(
        dir.path(),
        r#"{
  "version": 1,
  "columns": [
    { "name": "Todo", "order": 0 },
    { "name": "Done", "order": 1 }
  ],
  "cardOrder": { "Todo": ["tasks/c.md", "tasks/a.md", "tasks/b.md"] }
}"#,
    );

    let payload = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("should succeed");

    let paths: Vec<&str> = payload.tasks.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(paths, vec!["tasks/c.md", "tasks/a.md", "tasks/b.md"]);
}

#[test]
fn payload_tasks_absent_from_card_order_come_after_listed_ones_by_id() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(dir.path(), "tasks/z.md", &task_md("Z", "Todo", None));
    write_config_json(
        dir.path(),
        r#"{
  "version": 1,
  "columns": [{ "name": "Todo", "order": 0 }],
  "cardOrder": { "Todo": ["tasks/z.md"] }
}"#,
    );

    let payload = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("should succeed");

    let paths: Vec<&str> = payload.tasks.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(paths, vec!["tasks/z.md", "tasks/a.md", "tasks/b.md"]);
}

#[test]
fn payload_tasks_are_grouped_by_column_display_order() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Done", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_config_json(
        dir.path(),
        r#"{
  "version": 1,
  "columns": [
    { "name": "Todo", "order": 0 },
    { "name": "Done", "order": 1 }
  ],
  "cardOrder": {}
}"#,
    );

    let payload = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("should succeed");

    let paths: Vec<&str> = payload.tasks.iter().map(|t| t.file_path.as_str()).collect();
    assert_eq!(paths, vec!["tasks/b.md", "tasks/a.md"]);
}

// ───────── projection の同梱 ─────────

/// `build_payload` を直接叩くテスト用の Task。`children` は空のまま渡し、
/// projection が `parent` 由来であることを fixture 側で担保する。
fn sample_task_with_parent(file_path: &str, parent: Option<&str>) -> Task {
    Task {
        draft: false,
        id: file_path.into(),
        file_path: file_path.into(),
        title: "T".into(),
        status: "Todo".into(),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: parent.map(Into::into),
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

/// 親 1 / 子 2（うち 1 件が Done）の 3 カラム構成プロジェクトを open する。
fn open_hierarchy_project(state: Arc<AppState>, dir: &TempDir) -> OpenProjectPayload {
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo",  "order": 0 },
            { "name": "Doing", "order": 1 },
            { "name": "Done",  "order": 2 }
        ],
        "cardOrder": { "Todo": ["tasks/p.md"] },
        "doneColumn": "Done"
    }"#;
    write_config_json(dir.path(), config_json);
    write_md(
        dir.path(),
        "tasks/p.md",
        &task_md_with_milestone("P", "Todo", None, "v1"),
    );
    write_md(
        dir.path(),
        "tasks/c1.md",
        &task_md_with_milestone("C1", "Done", Some("tasks/p.md"), "v1"),
    );
    write_md(
        dir.path(),
        "tasks/c2.md",
        &task_md_with_milestone("C2", "Doing", Some("tasks/p.md"), "v1"),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(state, &raw).expect("open should succeed")
}

#[test]
fn open_payload_includes_projections_for_every_task() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();

    let payload = open_hierarchy_project(Arc::clone(&state), &dir);

    assert_eq!(payload.projections.len(), payload.tasks.len());
    let parent = payload
        .projections
        .get("tasks/p.md")
        .expect("parent projection");
    assert_eq!(parent.sub_issue_progress.total, 2);
    assert_eq!(parent.sub_issue_progress.done, 1);
    let milestone = payload
        .milestone_projections
        .get("v1")
        .expect("v1 projection");
    assert_eq!(milestone.total, 3);
    assert_eq!(milestone.done, 1);
}

/// `open_project` と `get_tasks` は同じ aggregate method を通るため集計値が一致する。
#[test]
fn open_payload_projections_match_get_tasks_projections() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();

    let payload = open_hierarchy_project(Arc::clone(&state), &dir);
    let from_get_tasks = crate::task::get::get_tasks_impl(&state).expect("get_tasks");

    assert_eq!(payload.projections, from_get_tasks.projections);
    assert_eq!(
        payload.milestone_projections,
        from_get_tasks.milestone_projections
    );
}

/// task projection は filePath key の内容だけを持ち、入力順に依存しない。
#[test]
fn task_projection_semantics_do_not_depend_on_input_order() {
    let cfg = Config {
        version: 1,
        columns: vec![Column {
            name: "Todo".into(),
            order: 0,
            color: None,
            wip_limit: None,
        }],
        card_order: CardOrder::from_raw_map(BTreeMap::from([(
            "Todo".to_string(),
            vec!["tasks/c.md".to_string()],
        )])),
        done_column: None,
    };
    let parent = sample_task_with_parent("tasks/p.md", None);
    let child = sample_task_with_parent("tasks/c.md", Some("tasks/p.md"));

    let ordered =
        super::build_payload_from_parts(vec![parent.clone(), child.clone()], &cfg, zero_session());
    let reversed = super::build_payload_from_parts(vec![child, parent], &cfg, zero_session());

    assert_eq!(ordered.projections, reversed.projections);
    assert_eq!(
        ordered.projections["tasks/p.md"].sub_issue_progress.total,
        1
    );
}

#[test]
fn project_without_tasks_has_empty_projections() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("open should succeed");

    assert!(payload.tasks.is_empty());
    assert!(payload.projections.is_empty());
    assert!(payload.milestone_projections.is_empty());
}

#[test]
fn open_and_get_tasks_milestone_paths_match_the_exact_board_order() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
  "version": 1,
  "columns": [
    { "name": "Todo", "order": 0 },
    { "name": "Done", "order": 1 }
  ],
  "cardOrder": {
    "Todo": ["tasks/e.md", "tasks/c.md", "tasks/a.md", "tasks/d.md"],
    "Done": ["tasks/b.md"]
  },
  "doneColumn": "Done"
}"#,
    );
    for (name, status) in [
        ("a", "Todo"),
        ("b", "Done"),
        ("c", "Todo"),
        ("d", "Todo"),
        ("e", "Todo"),
    ] {
        write_md(
            dir.path(),
            &format!("tasks/{name}.md"),
            &task_md_with_milestone(name, status, None, "v1"),
        );
    }

    let open_payload = open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8"))
        .expect("open should succeed");
    let get_payload = crate::task::get::get_tasks_impl(&state).expect("get_tasks");
    let open_task_paths: Vec<&str> = open_payload
        .tasks
        .iter()
        .map(|task| task.file_path.as_str())
        .collect();
    let open_milestone_paths: Vec<&str> = open_payload.milestone_projections["v1"]
        .task_file_paths
        .iter()
        .map(|path| path.as_str())
        .collect();
    let get_milestone_paths: Vec<&str> = get_payload.milestone_projections["v1"]
        .task_file_paths
        .iter()
        .map(|path| path.as_str())
        .collect();

    assert_eq!(
        open_task_paths,
        vec![
            "tasks/e.md",
            "tasks/c.md",
            "tasks/a.md",
            "tasks/d.md",
            "tasks/b.md"
        ]
    );
    assert_eq!(open_milestone_paths, open_task_paths);
    assert_eq!(get_milestone_paths, open_task_paths);
    assert_eq!(open_payload.milestone_projections["v1"].done, 1);
    assert_eq!(
        open_payload.milestone_projections,
        get_payload.milestone_projections
    );
}

/// `open_project` と `get_tasks` は同じ board 表示順（カラム順 → cardOrder → id 順）
/// で返す。FE は配列順をそのまま表示順に使うため、片方が id 順だと watcher の
/// full rescan / gap 復旧のたびに DnD で決めた並びが崩れる。
#[test]
fn open_and_get_tasks_return_the_same_board_order() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo", "order": 0 },
            { "name": "Done", "order": 1 }
        ],
        "cardOrder": {}
    }"#;
    write_config_json(dir.path(), config_json);
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Done", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("open should succeed");
    let from_get_tasks = crate::task::get::get_tasks_impl(&state).expect("get_tasks");

    let open_ids: Vec<&str> = payload.tasks.iter().map(|t| t.id.as_str()).collect();
    let get_ids: Vec<&str> = from_get_tasks.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/b.md", "tasks/a.md"], open_ids);
    assert_eq!(open_ids, get_ids);
}

/// `cardOrder` が id 昇順と食い違う並びでも `get_tasks` がその並びを返す。
#[test]
fn get_tasks_preserves_a_card_order_that_differs_from_id_order() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let config_json = r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": { "Todo": ["tasks/c.md", "tasks/a.md", "tasks/b.md"] }
    }"#;
    write_config_json(dir.path(), config_json);
    for name in ["a", "b", "c"] {
        write_md(
            dir.path(),
            &format!("tasks/{name}.md"),
            &task_md(name, "Todo", None),
        );
    }
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw).expect("open should succeed");

    let from_get_tasks = crate::task::get::get_tasks_impl(&state).expect("get_tasks");

    let ids: Vec<&str> = from_get_tasks.tasks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(vec!["tasks/c.md", "tasks/a.md", "tasks/b.md"], ids);
}

// ───────── full rescan パイプラインとの一致 ─────────

#[test]
fn open_project_impl_returns_the_same_tasks_as_the_shared_rebuild_pipeline() {
    let dir = tempdir();
    fs::create_dir_all(dir.path().join("tasks")).expect("create tasks dir");
    fs::write(
        dir.path().join("tasks/parent.md"),
        "---\ntitle: Parent\nstatus: Todo\n---\n",
    )
    .expect("write parent");
    fs::write(
        dir.path().join("tasks/child.md"),
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\nlinks:\n  - tasks/parent.md\n---\n",
    )
    .expect("write child");
    let state = Arc::new(AppState::new());

    let payload =
        open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("open ok");

    let rebuilt = crate::task::rebuild::rebuild_tasks_from_disk(
        dir.path(),
        &"Todo".into(),
        &crate::task::io::FsTaskIo,
    )
    .expect("rebuild ok");
    let mut from_open: Vec<Task> = payload.tasks;
    from_open.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    let mut from_rebuild = rebuilt;
    from_rebuild.sort_by(|a, b| a.file_path.cmp(&b.file_path));

    assert_eq!(from_rebuild, from_open);
}

// ───────── watcher session（cache install と同一トランザクション） ─────────

#[derive(Debug)]
struct ActivationObservation {
    identity: SessionIdentity,
    generation: ProjectGeneration,
    event_seq: EventSeq,
    revision: TasksRevision,
}

/// activation 後に 1 件の mutation を模す factory。
struct EmittingOnActivationFactory {
    completed: mpsc::Sender<ActivationObservation>,
}

impl WatcherFactory for EmittingOnActivationFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let state = Arc::clone(state);
        let completed = self.completed.clone();
        stage_test_resources(
            identity,
            move || {
                state
                    .test_update_tasks(|cache| {
                        cache.insert(
                            crate::task::canonical_task_path::CanonicalTaskPath::new(
                                "tasks/spawned.md",
                            ),
                            sample_spawned_task(),
                        );
                    })
                    .expect("writable");
                let current_identity = state
                    .require_session_snapshot()
                    .expect("current session snapshot")
                    .identity();
                let event_seq = state
                    .next_event_seq_if_current(&current_identity)
                    .expect("event sequence lock")
                    .expect("post-mutation identity is current");
                completed
                    .send(ActivationObservation {
                        identity: current_identity,
                        generation: state.test_project_generation(),
                        event_seq,
                        revision: state.test_tasks_revision(),
                    })
                    .expect("signal activation mutation");
            },
            || {},
        )
    }
}

/// activation 後に観測した generation を記録する factory。
struct GenerationProbeFactory {
    observed: Arc<AtomicUsize>,
    completed: mpsc::Sender<()>,
}

impl WatcherFactory for GenerationProbeFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let observed = Arc::clone(&self.observed);
        let completed = self.completed.clone();
        let state = Arc::clone(state);
        stage_test_resources(
            identity,
            move || {
                observed.store(
                    state.test_project_generation().as_u64() as usize,
                    Ordering::SeqCst,
                );
                completed.send(()).expect("signal generation observation");
            },
            || {},
        )
    }
}

fn sample_spawned_task() -> Task {
    Task {
        draft: false,
        id: "tasks/spawned.md".into(),
        file_path: "tasks/spawned.md".into(),
        title: "Spawned".into(),
        status: "Todo".into(),
        priority: None,
        milestone: Some("v1".to_owned()),
        labels: Vec::new(),
        parent: None,
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: Default::default(),
        warnings: Vec::new(),
    }
}

fn open_with(
    state: Arc<AppState>,
    path: &str,
    watcher: &impl WatcherFactory,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let intent = OpenProjectIntent::try_from(path.to_string())?;
    let labels_store = crate::config::label_registry_store(intent.as_path());
    let milestones_store = crate::config::milestone_registry_store(intent.as_path());
    open_project_impl(&state, &intent, &labels_store, &milestones_store, watcher)
}

#[test]
fn open_payload_carries_the_project_key_and_the_first_generation() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());

    let payload =
        open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("open ok");

    assert_eq!(
        dir.path().to_string_lossy().as_ref(),
        payload.session.project_key.as_str()
    );
    assert_eq!(1, payload.session.generation.as_u64());
}

#[test]
fn reopening_a_project_advances_the_generation() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("first open");

    let second =
        open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("second");

    assert_eq!(2, second.session.generation.as_u64());
}

#[test]
fn post_activation_mutation_cannot_desynchronize_committed_payload() {
    let dir = tempdir();
    fs::create_dir_all(dir.path().join("tasks")).expect("create tasks dir");
    fs::write(
        dir.path().join("tasks/a.md"),
        "---\ntitle: A\nstatus: Todo\nmilestone: v1\n---\n",
    )
    .expect("write md");
    let state = Arc::new(AppState::new());
    let (completed_tx, completed_rx) = mpsc::channel();
    let factory = EmittingOnActivationFactory {
        completed: completed_tx,
    };

    let payload = open_with(
        Arc::clone(&state),
        dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("open ok");
    completed_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("activated mutation completes");

    assert_eq!(
        1,
        payload.tasks.len(),
        "payload is derived solely from the committed swap snapshot"
    );
    let milestone = payload
        .milestone_projections
        .get("v1")
        .expect("committed snapshot projection");
    assert_eq!(milestone.total, 1);
    assert_eq!(milestone.task_file_paths.len(), 1);
    assert_eq!(milestone.task_file_paths[0].as_str(), "tasks/a.md");
    assert!(payload.session.revision < state.test_tasks_revision());
}

#[test]
fn first_post_activation_event_follows_the_open_payload_baseline() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    let (completed_tx, completed_rx) = mpsc::channel();
    let factory = EmittingOnActivationFactory {
        completed: completed_tx,
    };

    let payload = open_with(
        Arc::clone(&state),
        dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("open ok");
    let observed = completed_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("activation event");

    assert_eq!(
        payload.session.project_key.as_str(),
        observed.identity.project_root().to_string().as_str()
    );
    assert_eq!(payload.session.generation, observed.generation);
    assert_eq!(
        payload.session.event_seq.as_u64() + 1,
        observed.event_seq.as_u64()
    );
    assert!(payload.session.revision < observed.revision);
}

#[test]
fn activation_observes_the_same_generation_that_the_payload_reports() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    let observed = Arc::new(AtomicUsize::new(0));
    let (completed_tx, completed_rx) = mpsc::channel();
    let factory = GenerationProbeFactory {
        observed: Arc::clone(&observed),
        completed: completed_tx,
    };

    let payload = open_with(
        Arc::clone(&state),
        dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("open ok");
    completed_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("generation observation completes");

    assert_eq!(
        payload.session.generation.as_u64() as usize,
        observed.load(Ordering::SeqCst)
    );
}

#[test]
fn a_failed_watcher_init_leaves_the_generation_untouched() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    let factory = FailingPrepareFactory::new("inotify limit");

    open_with(
        Arc::clone(&state),
        dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect_err("prepare fails");

    assert_eq!(
        0,
        state.test_project_generation().as_u64(),
        "commit へ到達していないので世代は発行されない"
    );
}

#[test]
fn stage_failure_preserves_resident_state_and_leaves_a_session_id_gap() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    let first = open_with_noop(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
    )
    .expect("first open");
    let identity_before = state.active_session_identity().expect("first identity");

    let failed_dir = tempdir();
    let error = open_with(
        Arc::clone(&state),
        failed_dir.path().to_str().expect("utf-8"),
        &FailingStageFactory,
    )
    .expect_err("stage fails");
    assert!(matches!(error, OpenProjectError::WatcherInitFailed { .. }));
    assert_eq!(
        identity_before,
        state.active_session_identity().expect("identity preserved")
    );
    state
        .resources_for(identity_before.version())
        .expect("resources preserved");

    let third_dir = tempdir();
    let third = open_with_noop(
        Arc::clone(&state),
        third_dir.path().to_str().expect("utf-8"),
    )
    .expect("next open");
    assert_eq!(
        first.session.generation.as_u64() + 2,
        third.session.generation.as_u64(),
        "the ID reserved before failed stage is never reused"
    );
}

#[test]
fn identity_mismatch_is_typed_and_preserves_resident_state() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    open_with_noop(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
    )
    .expect("first open");
    let identity_before = state.active_session_identity().expect("first identity");

    let second_dir = tempdir();
    let error = open_with(
        Arc::clone(&state),
        second_dir.path().to_str().expect("utf-8"),
        &IdentityMismatchFactory,
    )
    .expect_err("identity mismatch");

    assert!(matches!(
        error,
        OpenProjectError::SessionIdentityMismatch { .. }
    ));
    assert_eq!(
        identity_before,
        state.active_session_identity().expect("identity preserved")
    );
    state
        .resources_for(identity_before.version())
        .expect("resources preserved");
}

#[test]
fn paused_worker_processes_only_after_atomic_swap_activation() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    let processed = Arc::new(AtomicUsize::new(0));
    let (completed_tx, completed_rx) = mpsc::channel();
    let factory = ActivationProbeFactory {
        processed: Arc::clone(&processed),
        completed: completed_tx,
    };

    let payload = open_with(
        Arc::clone(&state),
        dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("open succeeds");
    completed_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("worker activated");

    assert_eq!(1, processed.load(Ordering::SeqCst));
    let identity = state.active_session_identity().expect("active identity");
    assert_eq!(
        payload.session.generation.as_u64(),
        identity.version().session_id.as_u64()
    );
    state
        .resources_for(identity.version())
        .expect("resources active with domain");
}

#[test]
fn blocked_displaced_stop_holds_neither_writer_gate_nor_state_locks() {
    let state = Arc::new(AppState::new());
    let first_dir = tempdir();
    let (stop_started_tx, stop_started_rx) = mpsc::channel();
    let (release_stop_tx, release_stop_rx) = mpsc::channel();
    let factory = BlockingStopFactory {
        stop_started: stop_started_tx,
        release_stop: Mutex::new(Some(release_stop_rx)),
    };
    open_with(
        Arc::clone(&state),
        first_dir.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("first open");

    let second_dir = tempdir();
    let second_path = second_dir.path().to_str().expect("utf-8").to_owned();
    let state_for_second = Arc::clone(&state);
    let second_join = thread::spawn(move || open_with_noop(state_for_second, &second_path));
    stop_started_rx
        .recv_timeout(std::time::Duration::from_secs(2))
        .expect("displaced stop blocks after swap");

    let third_dir = tempdir();
    let third_path = third_dir.path().to_str().expect("utf-8").to_owned();
    let state_for_third = Arc::clone(&state);
    let (third_done_tx, third_done_rx) = mpsc::channel();
    let third_join = thread::spawn(move || {
        let result = open_with_noop(state_for_third, &third_path).map(|_| ());
        third_done_tx.send(result).expect("signal third open");
    });
    let third_before_release = third_done_rx.recv_timeout(std::time::Duration::from_secs(2));

    release_stop_tx.send(()).expect("release displaced stop");
    second_join
        .join()
        .expect("second thread joins")
        .expect("second open succeeds");
    third_join.join().expect("third thread joins");
    third_before_release
        .expect("third open completes while displaced stop is blocked")
        .expect("third open succeeds");
}

// ───────── taskTree の同梱（get_tasks と同形・同順序） ─────────

fn tree_node_count(forest: &TaskForest) -> usize {
    let mut count = 0;
    let mut stack: Vec<&TaskTreeNode> = forest.iter().collect();
    while let Some(node) = stack.pop() {
        count += 1;
        stack.extend(node.children.iter());
    }
    count
}

#[test]
fn open_payload_contains_the_task_hierarchy_as_a_nested_tree() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();

    let payload = open_hierarchy_project(Arc::clone(&state), &dir);

    let roots: Vec<&str> = payload
        .task_tree
        .iter()
        .map(|node| node.file_path.as_str())
        .collect();
    assert_eq!(roots, vec!["tasks/p.md"]);
    let children: Vec<&str> = payload.task_tree[0]
        .children
        .iter()
        .map(|node| node.file_path.as_str())
        .collect();
    assert_eq!(children, vec!["tasks/c2.md", "tasks/c1.md"]);
}

#[test]
fn open_and_get_tasks_return_the_same_task_tree() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();

    let open_payload = open_hierarchy_project(Arc::clone(&state), &dir);
    let get_payload = crate::task::get::get_tasks_impl(&state).expect("get_tasks should succeed");

    assert_eq!(
        open_payload.task_tree, get_payload.task_tree,
        "初回ロード直後にツリービューを開いても再取得が要らない"
    );
}

#[test]
fn open_payload_task_tree_is_empty_for_a_project_without_tasks() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#,
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("open should succeed");

    assert!(payload.task_tree.is_empty());
}

#[test]
fn open_succeeds_for_mutually_referencing_parents_and_lists_each_task_once() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        &task_md("A", "Todo", Some("tasks/b.md")),
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        &task_md("B", "Todo", Some("tasks/a.md")),
    );
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::clone(&state), &raw).expect("open should succeed");

    assert_eq!(tree_node_count(&payload.task_tree), payload.tasks.len());
    assert_eq!(payload.task_tree.len(), 2, "循環メンバは全員 root");
}

/// stop 呼び出し回数だけを数える factory。
struct StopCountingFactory {
    stop_calls: Arc<AtomicUsize>,
}

impl WatcherFactory for StopCountingFactory {
    type Prepared = ();

    fn prepare(&self, _root: &Path) -> Result<(), OpenProjectError> {
        Ok(())
    }

    fn stage_paused(
        &self,
        _prepared: (),
        _state: &Arc<AppState>,
        identity: SessionIdentity,
    ) -> Result<StagedProjectResources, OpenProjectError> {
        let stop_calls = Arc::clone(&self.stop_calls);
        stage_test_resources(
            identity,
            || {},
            move || {
                stop_calls.fetch_add(1, Ordering::SeqCst);
            },
        )
    }
}

fn open_with_scheduler(
    state: Arc<AppState>,
    path: &str,
    resync: &dyn ReactivationResyncScheduler,
) -> Result<OpenProjectPayload, OpenProjectError> {
    let intent = OpenProjectIntent::try_from(path.to_string())?;
    let labels_store = crate::config::label_registry_store(intent.as_path());
    let milestones_store = crate::config::milestone_registry_store(intent.as_path());
    open_project_impl_with_reporter(
        &state,
        &intent,
        ProjectDataPorts {
            labels_store: &labels_store,
            milestones_store: &milestones_store,
            config_writer: &FsConfigWriter,
        },
        &NoopWatcherFactory,
        &LogWatcherStopDiagnosticReporter,
        resync,
    )
}

#[test]
fn reopen_after_switch_serves_tasks_from_cache_without_rescan() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_md(dir_a.path(), "tasks/a.md", &task_md("A", "Todo", None));
    open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8")).expect("cold open A");
    open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8")).expect("cold open B");
    // watcher 停止中の disk 変更。キャッシュ応答なら削除は payload に現れない。
    fs::remove_file(dir_a.path().join("tasks/a.md")).expect("remove task md");

    let payload = open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8"))
        .expect("cache-hit reopen A");

    assert_eq!(1, payload.tasks.len());
    assert_eq!("tasks/a.md", payload.tasks[0].file_path.as_str());
}

#[test]
fn reopen_after_switch_advances_generation_and_resets_revision() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    let first = open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8"))
        .expect("cold open A");
    open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8")).expect("cold open B");

    let reopened = open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8"))
        .expect("cache-hit reopen A");

    assert_eq!(1, first.session.generation.as_u64());
    assert_eq!(3, reopened.session.generation.as_u64());
    assert_eq!(0, reopened.session.revision.as_u64());
}

#[test]
fn cache_hit_schedules_reactivation_resync_for_the_new_identity() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    let scheduler = CollectingReactivationScheduler::new();
    open_with_scheduler(
        Arc::clone(&state),
        dir_a.path().to_str().expect("utf-8"),
        &scheduler,
    )
    .expect("cold open A");
    open_with_scheduler(
        Arc::clone(&state),
        dir_b.path().to_str().expect("utf-8"),
        &scheduler,
    )
    .expect("cold open B");

    let reopened = open_with_scheduler(
        Arc::clone(&state),
        dir_a.path().to_str().expect("utf-8"),
        &scheduler,
    )
    .expect("cache-hit reopen A");

    let scheduled = scheduler.scheduled();
    assert_eq!(1, scheduled.len());
    assert_eq!(
        reopened.session.generation.as_u64(),
        scheduled[0].version().session_id.as_u64()
    );
    assert_eq!(0, scheduled[0].version().revision.as_u64());
    assert_eq!(dir_a.path(), scheduled[0].project_root().as_path());
}

#[test]
fn cold_open_does_not_schedule_reactivation_resync() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    let scheduler = CollectingReactivationScheduler::new();

    open_with_scheduler(
        Arc::clone(&state),
        dir_a.path().to_str().expect("utf-8"),
        &scheduler,
    )
    .expect("cold open A");
    open_with_scheduler(
        Arc::clone(&state),
        dir_b.path().to_str().expect("utf-8"),
        &scheduler,
    )
    .expect("cold open B");

    assert!(scheduler.scheduled().is_empty());
}

#[test]
fn switch_stops_previous_watcher_exactly_once_on_cache_hit() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    let stop_calls = Arc::new(AtomicUsize::new(0));
    let factory = StopCountingFactory {
        stop_calls: Arc::clone(&stop_calls),
    };
    open_with(
        Arc::clone(&state),
        dir_a.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("cold open A");

    open_with(
        Arc::clone(&state),
        dir_b.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("cold open B");
    assert_eq!(1, stop_calls.load(Ordering::SeqCst));

    open_with(
        Arc::clone(&state),
        dir_a.path().to_str().expect("utf-8"),
        &factory,
    )
    .expect("cache-hit reopen A");
    assert_eq!(2, stop_calls.load(Ordering::SeqCst));
}

#[test]
fn cache_hit_installs_a_fresh_write_ignore_registry() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8")).expect("cold open A");
    let first_identity = state.active_session_identity().expect("first identity");
    let first_resources = state
        .resources_for(first_identity.version())
        .expect("first resources");
    first_resources
        .write_ignore()
        .register("tasks/dirty.md")
        .expect("register old session path");
    open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8")).expect("cold open B");

    open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8"))
        .expect("cache-hit reopen A");

    let reactivated = state
        .active_session_identity()
        .expect("reactivated identity");
    let resources = state
        .resources_for(reactivated.version())
        .expect("reactivated resources");
    assert!(resources.write_ignore().is_empty().expect("readable"));
}

#[test]
fn same_root_reopen_stays_cold() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_labels_yml(dir.path(), "labels:\n  - name: bug\n");
    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("first open");
    assert_eq!(
        1,
        state
            .test_labels()
            .expect("readable")
            .expect("labels loaded")
            .labels
            .len()
    );
    fs::remove_file(dir.path().join(".spec-board/labels.yml")).expect("remove labels.yml");

    open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("second open");

    assert!(state
        .test_labels()
        .expect("readable")
        .expect("labels loaded")
        .labels
        .is_empty());
}

#[test]
fn cache_hit_open_fails_when_directory_disappears() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    let raw_a = dir_a.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw_a).expect("cold open A");
    open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8")).expect("cold open B");
    let identity_before = state.active_session_identity().expect("B stays active");
    fs::remove_dir_all(dir_a.path()).expect("remove project A");

    let err = open_with_noop(Arc::clone(&state), &raw_a).expect_err("validation runs before cache");

    assert!(matches!(err, OpenProjectError::DirectoryNotFound { .. }));
    assert_eq!(
        identity_before,
        state.active_session_identity().expect("B stays active")
    );
}

#[test]
fn failed_reactivation_consumes_the_cache_entry() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_md(dir_a.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw_a = dir_a.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw_a).expect("cold open A");
    open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8")).expect("cold open B");
    let identity_before = state.active_session_identity().expect("B stays active");

    let err = open_with(
        Arc::clone(&state),
        &raw_a,
        &FailingPrepareFactory::new("inotify limit"),
    )
    .expect_err("watcher prepare failure aborts the reactivation");

    assert!(matches!(err, OpenProjectError::WatcherInitFailed { .. }));
    assert_eq!(
        identity_before,
        state.active_session_identity().expect("B stays active")
    );
    // 消費済みエントリは再 stash しない。リトライは disk を読むコールド経路になる。
    fs::remove_file(dir_a.path().join("tasks/a.md")).expect("remove task md");
    let retried = open_with_noop(Arc::clone(&state), &raw_a).expect("retry opens cold");
    assert!(retried.tasks.is_empty());
}

#[test]
fn switch_chain_keeps_one_cache_entry_per_root() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    let dir_c = tempdir();
    write_md(dir_a.path(), "tasks/a.md", &task_md("A", "Todo", None));
    write_md(dir_b.path(), "tasks/b.md", &task_md("B", "Todo", None));
    write_md(dir_c.path(), "tasks/c.md", &task_md("C", "Todo", None));
    for dir in [&dir_a, &dir_b, &dir_c] {
        open_with_noop(Arc::clone(&state), dir.path().to_str().expect("utf-8")).expect("cold open");
    }

    let reopened_b = open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8"))
        .expect("cache-hit reopen B");
    let reopened_a = open_with_noop(Arc::clone(&state), dir_a.path().to_str().expect("utf-8"))
        .expect("cache-hit reopen A");

    assert_eq!("tasks/b.md", reopened_b.tasks[0].file_path.as_str());
    assert_eq!("tasks/a.md", reopened_a.tasks[0].file_path.as_str());
    assert_eq!(4, reopened_b.session.generation.as_u64());
    assert_eq!(5, reopened_a.session.generation.as_u64());
}

#[test]
fn repeated_same_root_reopen_keeps_reading_disk() {
    let state = Arc::new(AppState::new());
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw).expect("open 1");
    open_with_noop(Arc::clone(&state), &raw).expect("open 2");
    fs::remove_file(dir.path().join("tasks/a.md")).expect("remove task md");

    let third = open_with_noop(Arc::clone(&state), &raw).expect("open 3");

    assert!(
        third.tasks.is_empty(),
        "same-path reopen must never serve the cache, got {:?}",
        third
            .tasks
            .iter()
            .map(|task| task.file_path.as_str())
            .collect::<Vec<_>>()
    );
}

#[test]
fn open_falls_back_to_a_cold_read_when_the_cache_lock_is_poisoned() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_md(dir_a.path(), "tasks/a.md", &task_md("A", "Todo", None));
    let raw_a = dir_a.path().to_str().expect("utf-8").to_string();
    open_with_noop(Arc::clone(&state), &raw_a).expect("cold open A");
    open_with_noop(Arc::clone(&state), dir_b.path().to_str().expect("utf-8")).expect("cold open B");
    let poisoning_state = Arc::clone(&state);
    let poisoned = thread::spawn(move || poisoning_state.poison_background_sessions_for_test());
    assert!(poisoned.join().is_err());

    let reopened =
        open_with_noop(Arc::clone(&state), &raw_a).expect("cache poison must not fail open");

    assert_eq!(1, reopened.tasks.len());
    assert_eq!("tasks/a.md", reopened.tasks[0].file_path.as_str());
}

// ───────── config reconcile（既存 config への未知 status 追加） ─────────

/// `.spec-board/GUIDE.md` を読む。存在しなければ `None`。
fn read_guide(root: &Path) -> Option<String> {
    fs::read_to_string(root.join(".spec-board").join("GUIDE.md")).ok()
}

fn write_guide(root: &Path, content: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).expect("create .spec-board");
    fs::write(dir.join("GUIDE.md"), content).expect("write GUIDE.md");
}

/// `Todo(0)` / `Doing(1)` / `Done(2)` の config を置く。
fn write_base_config(root: &Path) {
    write_config_json(
        root,
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo",  "order": 0 },
                { "name": "Doing", "order": 1 },
                { "name": "Done",  "order": 2 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
}

fn column_names_of(payload: &OpenProjectPayload) -> Vec<&str> {
    payload
        .columns
        .iter()
        .map(|column| column.as_str())
        .collect()
}

#[test]
fn reconcile_appends_unknown_status_column_to_payload_and_disk() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    assert_eq!(
        column_names_of(&payload),
        vec!["Todo", "Doing", "Done", "Review"]
    );
    let saved = read_saved_config(dir.path());
    let saved_names: Vec<&str> = saved.columns.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(saved_names, vec!["Todo", "Doing", "Done", "Review"]);
    assert_eq!(saved.columns[3].order, 3);
    assert_eq!(saved.done_column.as_deref(), Some("Done"));
}

#[test]
fn reconcile_keeps_user_column_order_and_card_order() {
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Alpha", "order": 2 },
                { "name": "Beta",  "order": 0 },
                { "name": "Gamma", "order": 1 }
            ],
            "cardOrder": { "Beta": ["tasks/b.md"] },
            "doneColumn": "Alpha"
        }"#,
    );
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Beta", None));
    write_md(dir.path(), "tasks/z.md", &task_md("Z", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    let saved = read_saved_config(dir.path());
    assert_eq!(
        saved.columns[..3].to_vec(),
        vec![
            Column {
                name: "Alpha".into(),
                order: 2,
                color: None,
                wip_limit: None,
            },
            Column {
                name: "Beta".into(),
                order: 0,
                color: None,
                wip_limit: None,
            },
            Column {
                name: "Gamma".into(),
                order: 1,
                color: None,
                wip_limit: None,
            },
        ]
    );
    assert_eq!(saved.columns[3].name.as_str(), "Review");
    assert_eq!(saved.columns[3].order, 3);
    assert_eq!(
        saved.card_order.get("Beta").map(|paths| paths
            .iter()
            .map(|p| p.as_str().to_string())
            .collect::<Vec<_>>()),
        Some(vec!["tasks/b.md".to_string()])
    );
    assert_eq!(saved.done_column.as_deref(), Some("Alpha"));
}

#[test]
fn reconcile_writes_nothing_when_every_status_is_known() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("should succeed");

    assert_eq!(0, writer.calls());
}

#[test]
fn reconcile_is_idempotent_across_cold_reopens() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    let first =
        open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("first open");
    let calls_after_first = writer.calls();
    let second =
        open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("second open");

    assert_eq!(first.columns, second.columns);
    assert_eq!(
        read_saved_config(dir.path()).done_column.as_deref(),
        Some("Done")
    );
    assert_eq!(1, calls_after_first);
    assert_eq!(calls_after_first, writer.calls(), "2 回目は書き直さない");
}

#[test]
fn reconcile_freezes_done_column_when_the_config_has_none() {
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {}
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    let saved = read_saved_config(dir.path());
    assert_eq!(
        saved.done_column.as_deref(),
        Some("Done"),
        "追加前の末尾カラムで確定し、新カラムを指さない"
    );
}

#[test]
fn reconcile_does_not_repair_a_done_column_outside_columns() {
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 }
            ],
            "cardOrder": {},
            "doneColumn": "Ghost"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    let saved = read_saved_config(dir.path());
    assert_eq!(saved.done_column.as_deref(), Some("Ghost"));
    let names: Vec<&str> = saved.columns.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, vec!["Todo", "Review"]);
}

#[test]
fn reconcile_save_failure_keeps_the_old_columns_and_adds_one_warning() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let before = fs::read(dir.path().join(".spec-board").join("config.json")).expect("read config");

    let payload = open_with_config_writer(Arc::new(AppState::new()), &raw, &FailingConfigWriter)
        .expect("config write failure must not fail the open");

    assert_eq!(column_names_of(&payload), vec!["Todo", "Doing", "Done"]);
    assert_eq!(1, payload.load_warnings.len());
    assert_eq!(
        crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback,
        payload.load_warnings[0].code
    );
    let after = fs::read(dir.path().join(".spec-board").join("config.json")).expect("read config");
    assert_eq!(before, after);
}

#[test]
fn broken_config_is_not_reconciled_and_keeps_a_single_warning() {
    let dir = tempdir();
    let broken = "{ this is not json";
    write_config_json(dir.path(), broken);
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::new(AppState::new()), &raw).expect("should fall back");

    let on_disk = fs::read_to_string(dir.path().join(".spec-board").join("config.json"))
        .expect("config.json should still exist");
    assert_eq!(broken, on_disk);
    assert_eq!(1, payload.load_warnings.len());
    assert_eq!(
        crate::project::load_warning::ProjectLoadWarningCode::ConfigFallback,
        payload.load_warnings[0].code
    );
}

#[test]
fn broken_config_leaves_the_existing_guide_markdown_untouched() {
    let dir = tempdir();
    write_config_json(dir.path(), "{ this is not json");
    let guide_before = "# ユーザーが用意した GUIDE\n\n- Backlog\n";
    write_guide(dir.path(), guide_before);
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should fall back");

    assert_eq!(read_guide(dir.path()).as_deref(), Some(guide_before));
}

#[test]
fn readable_config_still_refreshes_the_guide_markdown_on_cold_open() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_guide(dir.path(), "stale\n");
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    let guide = read_guide(dir.path()).expect("GUIDE.md should exist");
    assert!(guide.contains("- Todo"));
    assert!(guide.contains("- Doing"));
    assert!(guide.contains("- Done"));
}

#[test]
fn absent_config_still_writes_the_guide_markdown_on_cold_open() {
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Backlog", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    let guide = read_guide(dir.path()).expect("GUIDE.md should exist");
    assert!(guide.contains("- Backlog"));
}

#[test]
fn reconcile_refreshes_the_guide_markdown_with_the_new_column() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    let guide = read_guide(dir.path()).expect("GUIDE.md should exist");
    assert!(guide.contains("- Review"));
}

#[test]
fn absent_config_bootstraps_without_a_second_write() {
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("should succeed");

    assert_eq!(
        1,
        writer.calls(),
        "bootstrap だけが走り reconcile は走らない"
    );
}

#[test]
fn bootstrap_reload_path_still_writes_the_config_once() {
    // 生成 config の既定 status（order 最小）が走査時の "Todo" と変わるため、
    // `load_project_data` が 2 回走る経路。2 周目は生成 config が全 status を
    // 含むので reconcile は no-op になる。
    let dir = tempdir();
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Doing", None));
    write_md(dir.path(), "tasks/b.md", "---\ntitle: B\n---\n\nbody\n");
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    let payload =
        open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("should succeed");

    assert_eq!(column_names_of(&payload), vec!["Doing", "Todo"]);
    assert_eq!(1, writer.calls());
}

#[test]
fn reconcile_writes_nothing_for_an_empty_or_status_less_project() {
    struct Case {
        label: &'static str,
        md: Option<(&'static str, &'static str)>,
    }

    let cases = vec![
        Case {
            label: "task 0 件",
            md: None,
        },
        Case {
            label: "status 未記載タスクのみ",
            md: Some(("tasks/a.md", "---\ntitle: A\n---\n\nbody\n")),
        },
    ];

    for case in cases {
        let dir = tempdir();
        write_base_config(dir.path());
        if let Some((rel, body)) = case.md {
            write_md(dir.path(), rel, body);
        }
        let raw = dir.path().to_str().expect("utf-8").to_string();
        let writer = CountingConfigWriter::default();

        let payload = open_with_config_writer(Arc::new(AppState::new()), &raw, &writer)
            .expect("should succeed");

        assert_eq!(0, writer.calls(), "case: {}", case.label);
        assert_eq!(
            column_names_of(&payload),
            vec!["Todo", "Doing", "Done"],
            "case: {}",
            case.label
        );
    }
}

#[test]
fn reconcile_keeps_the_default_status_of_status_less_tasks() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", "---\ntitle: A\n---\n\nbody\n");
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    assert_eq!("Todo", status_of(&payload, "tasks/a.md"));
}

#[test]
fn reconcile_persists_an_empty_status_column_verbatim() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "\"\"", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    let first =
        open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("first open");
    let calls_after_first = writer.calls();
    let second =
        open_with_config_writer(Arc::new(AppState::new()), &raw, &writer).expect("second open");

    assert_eq!(column_names_of(&first), vec!["Todo", "Doing", "Done", ""]);
    let saved = read_saved_config(dir.path());
    assert_eq!(saved.columns[3].name.as_str(), "");
    assert_eq!(column_names_of(&second), column_names_of(&first));
    assert_eq!(calls_after_first, writer.calls(), "reopen で書き直さない");
}

#[test]
fn reconcile_adds_unknown_statuses_in_path_ascending_first_occurrence() {
    let dir = tempdir();
    write_base_config(dir.path());
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Blocked", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Review", None));
    write_md(dir.path(), "tasks/c.md", &task_md("C", "Blocked", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();

    let payload = open_with_noop(Arc::new(AppState::new()), &raw).expect("should succeed");

    assert_eq!(
        column_names_of(&payload),
        vec!["Todo", "Doing", "Done", "Blocked", "Review"]
    );
}

#[test]
fn a_column_deleted_by_update_columns_comes_back_at_the_tail() {
    let dir = tempdir();
    write_config_json(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo",   "order": 0 },
                { "name": "Review", "order": 1 },
                { "name": "Done",   "order": 2 }
            ],
            "cardOrder": { "Review": ["tasks/b.md", "tasks/a.md"] },
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", &task_md("A", "Review", None));
    write_md(dir.path(), "tasks/b.md", &task_md("B", "Review", None));
    let raw = dir.path().to_str().expect("utf-8").to_string();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), &raw).expect("first open");

    crate::config::update_columns::update_columns_impl(
        &state,
        &crate::task::io::FsTaskIo,
        &FsConfigWriter,
        crate::config::update_columns::UpdateColumnsArgs {
            columns: Some(vec![
                Column {
                    name: "Todo".into(),
                    order: 0,
                    color: None,
                    wip_limit: None,
                },
                Column {
                    name: "Done".into(),
                    order: 2,
                    color: None,
                    wip_limit: None,
                },
            ]),
            done_column: None,
            renames: None,
        },
    )
    .expect("update_columns removes the Review column");
    assert!(
        read_saved_config(dir.path())
            .card_order
            .get("Review")
            .is_none(),
        "削除で cardOrder のエントリも消える"
    );

    let reopened = open_with_noop(Arc::new(AppState::new()), &raw).expect("cold reopen");

    assert_eq!(column_names_of(&reopened), vec!["Todo", "Done", "Review"]);
    let saved = read_saved_config(dir.path());
    assert!(saved.card_order.get("Review").is_none());
    let review_task_ids: Vec<&str> = reopened
        .tasks
        .iter()
        .filter(|task| task.status.as_str() == "Review")
        .map(|task| task.id.as_str())
        .collect();
    assert_eq!(
        review_task_ids,
        vec!["tasks/a.md", "tasks/b.md"],
        "cardOrder が無いカラムは id 昇順で並ぶ"
    );
}

#[test]
fn cache_hit_reopen_does_not_write_the_config_synchronously() {
    let state = Arc::new(AppState::new());
    let dir_a = tempdir();
    let dir_b = tempdir();
    write_base_config(dir_a.path());
    write_md(dir_a.path(), "tasks/a.md", &task_md("A", "Review", None));
    let raw_a = dir_a.path().to_str().expect("utf-8").to_string();
    let raw_b = dir_b.path().to_str().expect("utf-8").to_string();
    let writer = CountingConfigWriter::default();

    open_with_config_writer(Arc::clone(&state), &raw_a, &writer).expect("cold open A");
    open_with_config_writer(Arc::clone(&state), &raw_b, &writer).expect("cold open B");
    let calls_before_reopen = writer.calls();
    let reopened = open_with_config_writer(Arc::clone(&state), &raw_a, &writer).expect("reopen A");

    assert_eq!(
        column_names_of(&reopened),
        vec!["Todo", "Doing", "Done", "Review"]
    );
    assert_eq!(
        calls_before_reopen,
        writer.calls(),
        "再オープンの同期経路では config を書かない（差分の有無に関わらず、書き込みは背景 resync の責務）"
    );
}
