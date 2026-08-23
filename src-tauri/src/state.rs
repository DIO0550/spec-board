//! アプリケーション全体で共有するグローバル状態 `AppState`。
//!
//! `open_project` / `get_tasks` 等の Tauri command が共有するアプリ状態を集約する。
//! domain aggregate と active project resources を別々の `Mutex` で保持し、
//! snapshot/commit/swap の境界でだけ両者を同期する。
//!
//! # Lock 取得順序
//!
//! raw domain/resources/background mutex は private `state::locks` module だけが所有する。
//! domain と resources の同時取得は `DomainGuard::lock_resources(self)` でしか行えず、
//! domain → resources の順序を型で固定する。background cache と resources の単独参照は
//! guard を返さない値 API だけを公開する。
//!
//! writer gate も closure-scoped API だけを公開し、raw gate/guard を caller へ返さない。
//! 同一 thread の再入は root に関係なく typed error で即時拒否し、RAII marker を panic
//! と early return のどちらでも解除する。
//!
//! # フィールドカプセル化
//!
//! `AppState` は raw `Mutex` フィールドを持たず、private lock owner を経由する。
//! 公開アクセサを通すことで以下を保証する。
//!
//! - domain/resources の poison を typed error に変換する。
//! - resources は active session version を検証してから session-scoped registry を返す。
//! - watcher の停止・join は resources swap 後かつ AppState lock 外で行う。

#[cfg(test)]
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
#[cfg(test)]
use std::sync::Arc;

use thiserror::Error;

use spec_board_fs::watcher::handle::WatcherHandle;
#[cfg(test)]
use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

#[cfg(test)]
use crate::config::{Config, LabelRegistry, MilestoneRegistry};
use crate::project::project_root::ProjectRoot;
#[cfg(test)]
use crate::project_session::{PreparedProjectSession, SessionRevision};
use crate::project_session::{
    ProjectSession, ProjectSessionCommitError, ProjectSessionSnapshot, ProjectSessionStateError,
    ProjectState, RevisionExhausted, SessionCommit, SessionConflict, SessionId, SessionIdExhausted,
    SessionIdentity, SessionVersion,
};
pub(crate) use crate::state::active_project_resources::SessionResourceAccess;
pub use crate::state::active_project_resources::SessionResourceConflict;
use crate::state::active_project_resources::{ActiveProjectResources, StagedProjectResources};
use crate::state::event_seq::EventSeq;
use crate::state::locks::StateLocks;
#[cfg(test)]
use crate::state::project_generation::ProjectGeneration;
use crate::state::project_writer_gates::ProjectWriterGates;
#[cfg(test)]
use crate::state::tasks_revision::TasksRevision;
use crate::state::watcher_session::WatcherSession;
#[cfg(test)]
use crate::task::canonical_task_path::CanonicalTaskPath;
#[cfg(test)]
use crate::task::task_index::Task;

/// `tauri::Builder::manage` に渡すために `'static` を含む trait object 型。
pub type BoxedWatcherHandle = Box<dyn WatcherHandle + Send + 'static>;

/// `AppState` のロック関連エラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum AppStateError {
    /// background session cache の `Mutex` が poison 状態にある。
    #[error("background session cache lock poisoned")]
    BackgroundSessionsLockPoisoned,
    /// project domain の `Mutex` が poison 状態にある。
    #[error("project domain lock poisoned")]
    DomainLockPoisoned,
    /// いずれかの内部 `Mutex` が poison 状態にあり、ロックを取得できなかった。
    #[error("app state lock poisoned")]
    LockPoisoned,
    /// project domain が `Idle` である。
    #[error("no project is open")]
    NoProjectOpen,
    /// active project resources の `Mutex` が poison 状態にある。
    #[error("active project resource lock poisoned")]
    ResourceLockPoisoned,
    /// project writer gate table の `Mutex` が poison 状態にある。
    #[error("project writer gate table lock poisoned")]
    WriterGateTablePoisoned,
    /// project 固有 writer gate の `Mutex` が poison 状態にある。
    #[error("project writer gate lock poisoned")]
    WriterGatePoisoned,
    /// 同一 thread が writer lease 内から別の writer lease へ再入した。
    #[error("project writer lease is not reentrant")]
    WriterLeaseReentrant,
}

/// session-scoped resourcesの取得失敗。
#[derive(Debug, Error, PartialEq, Eq)]
pub(crate) enum ResourceAccessError {
    /// resources lockを取得できない。
    #[error(transparent)]
    State(#[from] AppStateError),
    /// 要求したsession versionがactive resourcesと一致しない。
    #[error(transparent)]
    Conflict(#[from] SessionResourceConflict),
}

/// ProjectSessionのresident commit失敗。
#[derive(Debug, Error, PartialEq, Eq)]
pub(crate) enum CommitSessionError {
    /// AppState lockを取得できない。
    #[error(transparent)]
    State(#[from] AppStateError),
    /// stale identityまたはrevision枯渇。
    #[error(transparent)]
    Domain(#[from] ProjectSessionCommitError),
    /// domainとactive resourcesのversionが一致しない。
    #[error(transparent)]
    ResourceConflict(#[from] SessionResourceConflict),
}

/// writer lease取得からresident commitまでに発生するsession protocol error。
///
/// 各commandはこの型を1つのvariantとして保持し、lock poison、switch/reopen、
/// revision枯渇、resource identity不一致を文字列へ潰さず伝播する。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum SessionWriteError {
    /// projectが開かれていない。
    #[error("no project is open")]
    NoProjectOpen,
    /// AppState内部のlockまたはwriter gateへアクセスできない。
    #[error(transparent)]
    State(AppStateError),
    /// target lookup後にproject switchまたはsame-path reopenが完了した。
    #[error(transparent)]
    Conflict(#[from] SessionConflict),
    /// session-local revisionが最大値に達している。
    #[error(transparent)]
    RevisionExhausted(#[from] RevisionExhausted),
    /// snapshotとactive resourcesのversionが一致しない。
    #[error(transparent)]
    ResourceConflict(#[from] SessionResourceConflict),
}

impl From<AppStateError> for SessionWriteError {
    fn from(error: AppStateError) -> Self {
        match error {
            AppStateError::NoProjectOpen => Self::NoProjectOpen,
            error => Self::State(error),
        }
    }
}

impl From<ResourceAccessError> for SessionWriteError {
    fn from(error: ResourceAccessError) -> Self {
        match error {
            ResourceAccessError::State(error) => error.into(),
            ResourceAccessError::Conflict(error) => Self::ResourceConflict(error),
        }
    }
}

impl From<CommitSessionError> for SessionWriteError {
    fn from(error: CommitSessionError) -> Self {
        match error {
            CommitSessionError::State(error) => error.into(),
            CommitSessionError::Domain(ProjectSessionCommitError::Conflict(error)) => {
                Self::Conflict(error)
            }
            CommitSessionError::Domain(ProjectSessionCommitError::RevisionExhausted(error)) => {
                Self::RevisionExhausted(error)
            }
            CommitSessionError::ResourceConflict(error) => Self::ResourceConflict(error),
        }
    }
}

/// prepared openをdomain/resourcesへ確定できない理由。
#[derive(Clone, Debug, Error, PartialEq, Eq)]
pub(crate) enum OpenSwapError {
    /// domain lockがpoisonしている。
    #[error("project domain lock poisoned")]
    DomainLockPoisoned,
    /// resources lockがpoisonしている。
    #[error("active project resource lock poisoned")]
    ResourceLockPoisoned,
    /// candidateとstage済みresourcesのidentityが一致しない。
    #[error(
        "staged resources do not match candidate session: candidate={candidate:?}, staged={staged:?}"
    )]
    IdentityMismatch {
        candidate: SessionIdentity,
        staged: SessionIdentity,
    },
}

/// atomic open swapの確定結果。
pub(crate) struct OpenSwap {
    /// commitされたdomain snapshot。
    pub(crate) snapshot: ProjectSessionSnapshot,
    /// snapshotと同じbaselineから作った既存wire session。
    pub(crate) watcher_session: WatcherSession,
    /// lock外で停止する旧resources。
    pub(crate) displaced_resources: Option<ActiveProjectResources>,
    /// lock外でbackground cacheへstashする旧session。
    pub(crate) displaced_session: Option<ProjectSession>,
}

/// アプリ全体で共有するグローバル状態。
///
/// `tauri::Builder::manage(AppState::new())` で登録し、command 関数では
/// `state: tauri::State<'_, AppState>` として注入する。
///
/// 全フィールドは private。caller は公開アクセサを通じてのみ操作できる。
///
/// identity検証なしの採番APIは公開しない。
///
/// ```compile_fail,E0599
/// use spec_board_lib::state::AppState;
///
/// let state = AppState::new();
/// let _ = state.next_event_seq();
/// ```
pub struct AppState {
    locks: StateLocks,
    writer_gates: ProjectWriterGates,
    /// 次に予約するprocess内一意なsession ID。
    next_session_id: AtomicU64,
    /// emit 連番。emit 失敗時も消費する（欠番 → FE の gap 検知 → 自動再取得）。
    event_seq: AtomicU64,
}

impl AppState {
    /// 全フィールドを初期状態にした `AppState` を生成する。
    ///
    /// domain は `Idle`、active resources は `None` で初期化される。
    ///
    /// 初期化エントリーポイントは `new()` のみとし、`Default` 実装は意図的に
    /// 提供しない。
    // `Default` を生やすと AppState の生成経路が `new()` と `default()` に分かれ、
    // どちらで初期化されたかが呼び出し側で曖昧になる。アプリ状態の生成は 1 本に
    // 限定したいので、Default を伴わない `new()` への clippy の指摘は意図的に抑止する。
    #[allow(clippy::new_without_default)]
    pub fn new() -> Self {
        Self {
            locks: StateLocks::new(),
            writer_gates: ProjectWriterGates::new(),
            next_session_id: AtomicU64::new(1),
            event_seq: AtomicU64::new(0),
        }
    }

    /// 現在のproject sessionをcoherentなsnapshotとして返す。
    ///
    /// project未open時は[`AppStateError::NoProjectOpen`]を返す。
    pub fn require_session_snapshot(&self) -> Result<ProjectSessionSnapshot, AppStateError> {
        let guard = self.locks.lock_domain()?;
        guard.snapshot().map_err(|err| match err {
            ProjectSessionStateError::NoProjectOpen => AppStateError::NoProjectOpen,
        })
    }

    /// 現在のproject sessionをoptionalなcoherent snapshotとして返す。
    ///
    /// project未openは正常な`None`であり、domain lock poisonだけがerrorになる。
    pub fn session_snapshot(&self) -> Result<Option<ProjectSessionSnapshot>, AppStateError> {
        let guard = self.locks.lock_domain()?;
        match &*guard {
            ProjectState::Idle => Ok(None),
            ProjectState::Loaded(session) => Ok(Some(session.snapshot())),
        }
    }

    /// 現在のproject session identityを返す。
    pub fn active_session_identity(&self) -> Result<SessionIdentity, AppStateError> {
        let guard = self.locks.lock_domain()?;
        match &*guard {
            ProjectState::Idle => Err(AppStateError::NoProjectOpen),
            ProjectState::Loaded(session) => Ok(session.identity()),
        }
    }

    /// process内で一意なsession IDを予約する。
    pub(crate) fn reserve_session_id(&self) -> Result<SessionId, SessionIdExhausted> {
        let reserved = self
            .next_session_id
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |next_session_id| {
                next_session_id.checked_add(1)
            })
            .map_err(|_| SessionIdExhausted)?;

        Ok(SessionId::from_raw(reserved))
    }

    /// domain snapshotを既存watcher wire shapeへ変換する。
    pub(crate) fn watcher_session_for_snapshot(
        &self,
        snapshot: &ProjectSessionSnapshot,
    ) -> WatcherSession {
        WatcherSession::from_snapshot(
            snapshot,
            EventSeq::from_raw(self.event_seq.load(Ordering::SeqCst)),
        )
    }

    /// exact-root writer lease を保持した closure を実行する。
    ///
    /// raw gate と guard は caller へ公開せず、同一 thread の再入を root に関係なく
    /// [`AppStateError::WriterLeaseReentrant`] として即時拒否する。
    pub(crate) fn with_project_root_writer_lease<T>(
        &self,
        root: &ProjectRoot,
        operation: impl FnOnce() -> T,
    ) -> Result<T, AppStateError> {
        self.writer_gates.with_lease(root, operation)
    }

    /// current projectのexact-root writer leaseを保持したままoperationを実行する。
    ///
    /// target identityはgate取得前、mutation snapshotはgate取得後に読む。fresh
    /// snapshotはroot + SessionIdだけをtargetと比較するため、gate待機中の正常な
    /// revision進行を許可しつつproject switchとsame-path reopenをI/O前に拒否する。
    pub(crate) fn with_project_writer_lease<T, E>(
        &self,
        operation: impl FnOnce(&SessionIdentity, &ProjectSessionSnapshot) -> Result<T, E>,
    ) -> Result<T, E>
    where
        E: From<SessionWriteError>,
    {
        let target = self
            .active_session_identity()
            .map_err(SessionWriteError::from)
            .map_err(E::from)?;
        self.with_project_writer_lease_for(&target, |snapshot| operation(&target, snapshot))
    }

    /// callerが事前に束縛したtargetのexact-root writer leaseを取得する。
    ///
    /// registry storeなどをtarget rootへ束縛してeffect境界へ注入するcommand向け。
    /// gate待機後のfresh snapshotはroot + SessionIdで再検証し、same-path reopenを
    /// disk/store I/O前に拒否する。
    pub(crate) fn with_project_writer_lease_for<T, E>(
        &self,
        target: &SessionIdentity,
        operation: impl FnOnce(&ProjectSessionSnapshot) -> Result<T, E>,
    ) -> Result<T, E>
    where
        E: From<SessionWriteError>,
    {
        let result = self
            .with_project_root_writer_lease(target.project_root(), || {
                let snapshot = self
                    .require_session_snapshot()
                    .map_err(SessionWriteError::from)
                    .map_err(E::from)?;
                snapshot
                    .ensure_same_session(target)
                    .map_err(SessionWriteError::from)
                    .map_err(E::from)?;

                operation(&snapshot)
            })
            .map_err(SessionWriteError::from)
            .map_err(E::from)?;
        result
    }

    /// revision枯渇をresource取得より先に検証し、session-scoped accessを返す。
    ///
    /// callerはresident validationとtarget解決を済ませた直後、disk read、
    /// write-ignore登録、disk writeより前にこのAPIを呼ぶ。
    pub(crate) fn preflight_session_write(
        &self,
        snapshot: &ProjectSessionSnapshot,
    ) -> Result<SessionResourceAccess, SessionWriteError> {
        snapshot.version().revision.checked_next()?;
        let access = self.resources_for(snapshot.version())?;
        debug_assert_eq!(access.version(), snapshot.version());
        Ok(access)
    }

    /// full SessionId + Revision CASでresident mutationをcommitする。
    pub(crate) fn commit_session_write<T>(
        &self,
        expected: &SessionIdentity,
        apply: impl FnOnce(&mut ProjectSession) -> T,
    ) -> Result<SessionCommit<T>, SessionWriteError> {
        self.commit_session(expected, apply).map_err(Into::into)
    }

    /// expected versionと一致するactive resourcesのsession-scoped accessを返す。
    ///
    /// resources lock内でidentityを検証して`Arc<WriteIgnoreRegistry>`だけをclone
    /// するため、callerがdisk I/O中にresources guardを保持することはない。
    pub(crate) fn resources_for(
        &self,
        expected: SessionVersion,
    ) -> Result<SessionResourceAccess, ResourceAccessError> {
        self.locks.resources_for(expected)
    }

    /// expected identityとactive resourcesが一致するときだけresident stateをcommitする。
    ///
    /// lock順序はdomain→resources。revision枯渇・resource conflictではclosureを
    /// 実行せず、domain/resourcesのどちらも変更しない。
    pub(crate) fn commit_session<T>(
        &self,
        expected: &SessionIdentity,
        apply: impl FnOnce(&mut ProjectSession) -> T,
    ) -> Result<SessionCommit<T>, CommitSessionError> {
        let domain = self.locks.lock_domain()?;
        domain
            .ensure_identity(expected)
            .map_err(ProjectSessionCommitError::from)?;

        let mut resident = domain.lock_resources()?;
        let Some(actual_version) = resident
            .resources()
            .as_ref()
            .map(ActiveProjectResources::version)
        else {
            return Err(SessionResourceConflict::new(expected.version(), None).into());
        };
        if actual_version != expected.version() {
            return Err(
                SessionResourceConflict::new(expected.version(), Some(actual_version)).into(),
            );
        }

        let committed = resident.domain_mut().commit(expected, apply)?;
        resident
            .resources_mut()
            .as_mut()
            .expect("validated active resources remain present")
            .update_version(committed.version());
        Ok(committed)
    }

    /// expected identityがcurrentのときだけevent sequenceを1つ採番する。
    ///
    /// identity検証と採番を同じdomain critical sectionで直列化し、switch後の
    /// stale adapterがsequenceを消費するfalse gapを防ぐ。
    pub(crate) fn next_event_seq_if_current(
        &self,
        expected: &SessionIdentity,
    ) -> Result<Option<EventSeq>, AppStateError> {
        let domain = self.locks.lock_domain()?;
        if domain.active_identity().as_ref() != Some(expected) {
            return Ok(None);
        }
        Ok(Some(EventSeq::from_raw(
            self.event_seq.fetch_add(1, Ordering::SeqCst) + 1,
        )))
    }

    /// candidate domainとstage済みresourcesを1つのcritical sectionで確定する。
    ///
    /// 両lockとidentity検証、ready parts構築をstate replacement前に完了する。
    /// 最初のreplace以降はinfallibleなreplace/store/unparkだけを実行する。
    pub(crate) fn swap_open(
        &self,
        candidate: ProjectSession,
        staged: StagedProjectResources,
    ) -> Result<OpenSwap, OpenSwapError> {
        let domain = self
            .locks
            .lock_domain()
            .map_err(|_| OpenSwapError::DomainLockPoisoned)?;
        let mut resident = domain
            .lock_resources()
            .map_err(|_| OpenSwapError::ResourceLockPoisoned)?;

        let candidate_identity = candidate.identity();
        if staged.identity() != &candidate_identity {
            let staged_identity = staged.identity().clone();
            return Err(OpenSwapError::IdentityMismatch {
                candidate: candidate_identity,
                staged: staged_identity,
            });
        }

        let snapshot = candidate.snapshot();
        let watcher_session = self.watcher_session_for_snapshot(&snapshot);
        let (ready, activation) = staged.into_ready_parts();

        let previous = std::mem::replace(resident.domain_mut(), ProjectState::Loaded(candidate));
        // 同一rootのreopenで押し出されたsessionは退避対象にしない。cacheへ残すと、
        // 次の同一root openが「コールドで読み直す」契約を破って過去のデータを返す。
        let displaced_session = match previous {
            ProjectState::Idle => None,
            ProjectState::Loaded(session)
                if session.identity().project_root() == candidate_identity.project_root() =>
            {
                None
            }
            ProjectState::Loaded(session) => Some(session),
        };
        let displaced_resources = resident.resources_mut().replace(ready);
        activation.activate();

        Ok(OpenSwap {
            snapshot,
            watcher_session,
            displaced_resources,
            displaced_session,
        })
    }

    /// exact rootに一致するbackground sessionをcacheから取り出す。
    ///
    /// エントリはcacheから除去される。呼び出し側が再活性化に失敗した場合も
    /// 再stashはしない（次回openがコールド経路になるだけで、staleは返らない）。
    ///
    /// resident sessionと同じrootのエントリが、そのresidentより古い場合は破棄して
    /// `None`を返す。stashはdisplaced rootのgateを持たないため、別rootのopenが退避を
    /// 完了する前に同じrootがコールドで開き直されると、residentより古いエントリが
    /// 後から入り込みうる。これをそのまま返すと2世代前のデータをstaleに配ってしまう。
    pub(crate) fn take_background_session(
        &self,
        root: &ProjectRoot,
    ) -> Result<Option<ProjectSession>, AppStateError> {
        // resident の読み取りと cache lock は入れ子にしない（leaf lock を保つ）。
        let resident = {
            let domain = self.locks.lock_domain()?;
            domain.active_identity()
        };
        let Some(cached) = self.locks.take_background_session(root)? else {
            return Ok(None);
        };
        if is_superseded_by_resident(resident.as_ref(), &cached) {
            return Ok(None);
        }
        Ok(Some(cached))
    }

    /// swapで退避された旧sessionをbackground cacheへ保存する。
    ///
    /// 同一rootのエントリが既にある場合、SessionIdが大きい（= 後からopenされた）
    /// 方を残す。SessionIdはprocess内で単調増加するため、並行openによってstash
    /// 順序が逆転しても常に最新のsessionが勝つ。
    pub(crate) fn stash_background_session(
        &self,
        session: ProjectSession,
    ) -> Result<(), AppStateError> {
        self.locks.stash_background_session(session)
    }

    /// openのfallible load/stage前にdomain→resources lockを副作用なく検証する。
    ///
    /// background sessions lockはここではprobeしない。cacheは純粋な最適化であり、
    /// 使えなくてもコールドオープンで機能を継続できる。probeに含めると一度poisonした
    /// 時点で以後のopenが恒久的に失敗し、プロセス再起動でしか復旧できなくなる。
    pub(crate) fn check_open_locks(&self) -> Result<(), AppStateError> {
        let domain = self.locks.lock_domain()?;
        let _resident = domain.lock_resources()?;
        Ok(())
    }

    /// テストからbackground session cacheのlockをpoisonさせる。
    #[cfg(test)]
    pub(crate) fn poison_background_sessions_for_test(&self) {
        self.locks.poison_background_sessions_for_test();
    }

    /// test から active resources lock を poison する。
    #[cfg(test)]
    pub(crate) fn poison_resources_for_test(&self) {
        self.locks.poison_resources_for_test();
    }

    /// test から exact-root writer gate を poison する。
    #[cfg(test)]
    pub(crate) fn poison_writer_gate_for_test(&self, root: &ProjectRoot) {
        self.writer_gates.poison_gate_for_test(root);
    }

    /// test assertion 用に active resource version を値として返す。
    #[cfg(test)]
    pub(crate) fn active_resource_version_for_test(&self) -> Option<SessionVersion> {
        self.locks.active_resource_version_for_test()
    }

    /// unit test用にcoherentなdomain/resources一式をinstallする。
    ///
    /// production openと同じSessionId採番・swap経路を使い、disk watcherだけを
    /// no-op handleへ差し替える。legacy setterでdomainだけを作るfixtureを防ぐ。
    #[cfg(test)]
    pub(crate) fn install_test_project(
        &self,
        root: &Path,
        config: Config,
        labels: LabelRegistry,
        milestones: MilestoneRegistry,
        tasks: Vec<Task>,
    ) -> ProjectSessionSnapshot {
        use std::thread;

        use spec_board_fs::watcher::handle::NoopWatcherHandle;

        use crate::state::active_project_resources::{pending_activation_state, WatcherActivation};

        let root = ProjectRoot::from_path_buf(root.to_path_buf()).expect("valid test project root");
        let tasks = tasks
            .into_iter()
            .map(|task| (CanonicalTaskPath::from_file_path(&task.file_path), task))
            .collect();
        let session_id = self
            .reserve_session_id()
            .expect("test session ID must remain available");
        let candidate = PreparedProjectSession::new(root, config, labels, milestones, tasks)
            .into_session(session_id);
        let identity = candidate.identity();
        let staged = StagedProjectResources::new(
            identity,
            Box::new(NoopWatcherHandle::new()) as BoxedWatcherHandle,
            WatcherActivation::new(pending_activation_state(), thread::current()),
            Arc::new(WriteIgnoreRegistry::new()),
        );
        let swapped = self
            .swap_open(candidate, staged)
            .expect("test project swap must succeed");
        assert!(
            swapped.displaced_resources.is_none(),
            "install_test_project expects a fresh AppState"
        );
        swapped.snapshot
    }

    /// writer境界テスト用にdomain/resourcesのrevisionを同時に差し替える。
    #[cfg(test)]
    pub(crate) fn seed_session_revision_for_test(&self, revision: SessionRevision) {
        let domain = self.locks.lock_domain().expect("test domain lock");
        let mut resident = domain.lock_resources().expect("test resources lock");
        let ProjectState::Loaded(session) = resident.domain_mut() else {
            panic!("test project must be installed before seeding revision");
        };
        session.seed_revision_for_test(revision);
        let version = session.version();
        resident
            .resources_mut()
            .as_mut()
            .expect("test resources must be installed before seeding revision")
            .update_version(version);
    }
}

#[cfg(test)]
#[allow(dead_code)]
impl AppState {
    fn test_session_identity(&self) -> SessionIdentity {
        if let Ok(identity) = self.active_session_identity() {
            return identity;
        }

        self.install_test_project(
            Path::new("."),
            Config::default(),
            LabelRegistry::default(),
            MilestoneRegistry::default(),
            Vec::new(),
        )
        .identity()
    }

    pub(crate) fn test_project_root(&self) -> Result<Option<PathBuf>, AppStateError> {
        Ok(self
            .session_snapshot()?
            .map(|snapshot| snapshot.project_root().as_path_buf().clone()))
    }

    pub(crate) fn test_config(&self) -> Result<Option<Config>, AppStateError> {
        Ok(self
            .session_snapshot()?
            .map(|snapshot| snapshot.config().clone()))
    }

    pub(crate) fn test_labels(&self) -> Result<Option<LabelRegistry>, AppStateError> {
        Ok(self
            .session_snapshot()?
            .map(|snapshot| snapshot.labels().clone()))
    }

    pub(crate) fn test_milestones(&self) -> Result<Option<MilestoneRegistry>, AppStateError> {
        Ok(self
            .session_snapshot()?
            .map(|snapshot| snapshot.milestones().clone()))
    }

    pub(crate) fn test_set_project_root(&self, path: Option<PathBuf>) -> Result<(), AppStateError> {
        let Some(path) = path else {
            let domain = self.locks.lock_domain()?;
            let mut resident = domain.lock_resources()?;
            *resident.domain_mut() = ProjectState::Idle;
            *resident.resources_mut() = None;
            return Ok(());
        };

        let root = ProjectRoot::from_path_buf(path).map_err(|_| AppStateError::NoProjectOpen)?;
        let identity = self.test_session_identity();
        self.commit_session(&identity, |session| session.replace_project_root(root))
            .map_err(|error| match error {
                CommitSessionError::State(error) => error,
                _ => AppStateError::LockPoisoned,
            })?;
        Ok(())
    }

    pub(crate) fn test_replace_config(&self, config: Option<Config>) -> Result<(), AppStateError> {
        let Some(config) = config else {
            return self.test_set_project_root(None);
        };
        let identity = self.test_session_identity();
        self.commit_session(&identity, |session| session.replace_config(config))
            .map_err(|error| match error {
                CommitSessionError::State(error) => error,
                _ => AppStateError::LockPoisoned,
            })?;
        Ok(())
    }

    pub(crate) fn test_replace_labels(
        &self,
        labels: Option<LabelRegistry>,
    ) -> Result<(), AppStateError> {
        let Some(labels) = labels else {
            return self.test_set_project_root(None);
        };
        let identity = self.test_session_identity();
        self.commit_session(&identity, |session| session.replace_labels(labels))
            .map_err(|error| match error {
                CommitSessionError::State(error) => error,
                _ => AppStateError::LockPoisoned,
            })?;
        Ok(())
    }

    pub(crate) fn test_replace_milestones(
        &self,
        milestones: Option<MilestoneRegistry>,
    ) -> Result<(), AppStateError> {
        let Some(milestones) = milestones else {
            return self.test_set_project_root(None);
        };
        let identity = self.test_session_identity();
        self.commit_session(&identity, |session| session.replace_milestones(milestones))
            .map_err(|error| match error {
                CommitSessionError::State(error) => error,
                _ => AppStateError::LockPoisoned,
            })?;
        Ok(())
    }

    pub(crate) fn test_replace_tasks(
        &self,
        cache: std::collections::HashMap<CanonicalTaskPath, Task>,
    ) -> Result<(), AppStateError> {
        let identity = self.test_session_identity();
        self.commit_session(&identity, |session| session.replace_tasks(cache))
            .map_err(|error| match error {
                CommitSessionError::State(error) => error,
                _ => AppStateError::LockPoisoned,
            })?;
        Ok(())
    }

    pub(crate) fn test_tasks_snapshot(&self) -> Result<Vec<Task>, AppStateError> {
        Ok(self
            .session_snapshot()?
            .map(|snapshot| snapshot.tasks().values().cloned().collect())
            .unwrap_or_default())
    }

    pub(crate) fn test_update_tasks<F, R>(&self, f: F) -> Result<R, AppStateError>
    where
        F: FnOnce(&mut std::collections::HashMap<CanonicalTaskPath, Task>) -> R,
    {
        let identity = self.test_session_identity();
        let mut result = None;
        self.commit_session(&identity, |session| {
            result = Some(f(session.tasks_mut()));
        })
        .map_err(|error| match error {
            CommitSessionError::State(error) => error,
            _ => AppStateError::LockPoisoned,
        })?;
        result.ok_or(AppStateError::NoProjectOpen)
    }

    pub(crate) fn test_project_generation(&self) -> ProjectGeneration {
        self.session_snapshot()
            .ok()
            .flatten()
            .map(|snapshot| ProjectGeneration::from_raw(snapshot.version().session_id.as_u64()))
            .unwrap_or_else(|| ProjectGeneration::from_raw(0))
    }

    pub(crate) fn test_tasks_revision(&self) -> TasksRevision {
        self.session_snapshot()
            .ok()
            .flatten()
            .map(|snapshot| TasksRevision::from_raw(snapshot.version().revision.as_u64()))
            .unwrap_or_else(|| TasksRevision::from_raw(0))
    }
}

/// cacheエントリが同じrootのresident sessionに追い越されているかを判定する。
fn is_superseded_by_resident(resident: Option<&SessionIdentity>, cached: &ProjectSession) -> bool {
    let Some(resident) = resident else {
        return false;
    };
    let cached_identity = cached.identity();
    resident.project_root() == cached_identity.project_root()
        && resident.version().session_id >= cached_identity.version().session_id
}

pub(crate) mod active_project_resources;
pub mod change_id;
pub mod event_seq;
mod locks;
pub mod project_generation;
pub mod project_key;
mod project_writer_gates;
pub mod tasks_revision;
pub mod watcher_session;

#[cfg(test)]
mod state_tests;
