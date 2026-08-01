//! ProjectSession aggregateとcoherent snapshot。

use std::collections::HashMap;
use std::path::PathBuf;

use thiserror::Error;

use crate::config::{Config, LabelRegistry, MilestoneRegistry};
use crate::project::load_warning::ProjectLoadWarning;
use crate::project::project_root::ProjectRoot;
use crate::task::task_index::Task;

use super::{RevisionExhausted, SessionId, SessionRevision};

/// SessionIdとsession-local revisionの組。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SessionVersion {
    /// 成功openごとに一意なsession ID。
    pub session_id: SessionId,
    /// session内だけで増加するrevision。
    pub revision: SessionRevision,
}

/// project rootを含むcommit比較用identity。
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionIdentity {
    project_root: ProjectRoot,
    version: SessionVersion,
}

impl SessionIdentity {
    /// identityが指すproject rootを返す。
    pub fn project_root(&self) -> &ProjectRoot {
        &self.project_root
    }

    /// identityが指すsession versionを返す。
    pub const fn version(&self) -> SessionVersion {
        self.version
    }

    /// rootとSessionIdが同じsessionを指すかを返す。
    ///
    /// revisionはwriter gate待機中にも進み得るため、target lookup後のreopen検証では
    /// 比較対象に含めない。commit CASは引き続きidentity全体を比較する。
    #[must_use]
    pub fn is_same_session(&self, other: &Self) -> bool {
        self.project_root == other.project_root
            && self.version.session_id == other.version.session_id
    }
}

/// AppStateが保持するproject domain state。
#[derive(Debug)]
#[allow(clippy::large_enum_variant)]
pub enum ProjectState {
    /// projectが開かれていない状態。
    Idle,
    /// coherentなproject sessionが開かれている状態。
    Loaded(ProjectSession),
}

/// mutationが対象にしたidentityと現在のsessionが一致しない。
#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[error("project session conflict: expected {expected:?}, actual {actual:?}")]
pub struct SessionConflict {
    /// mutationが対象にしたidentity。
    pub expected: SessionIdentity,
    /// 検証時点のidentity。IdleならNone。
    pub actual: Option<SessionIdentity>,
}

impl SessionConflict {
    fn between(expected: &SessionIdentity, actual: Option<SessionIdentity>) -> Self {
        Self {
            expected: expected.clone(),
            actual,
        }
    }
}

fn ensure_identity_matches(
    expected: &SessionIdentity,
    actual: Option<SessionIdentity>,
) -> Result<(), SessionConflict> {
    if actual.as_ref() == Some(expected) {
        return Ok(());
    }

    Err(SessionConflict::between(expected, actual))
}

/// session commitが失敗した理由。
#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum ProjectSessionCommitError {
    /// expected identityがcurrent sessionと一致しない。
    #[error(transparent)]
    Conflict(#[from] SessionConflict),
    /// revisionが最大値に達している。
    #[error(transparent)]
    RevisionExhausted(#[from] RevisionExhausted),
}

/// 成功commitの返り値と新しいidentity。
#[derive(Debug)]
pub struct SessionCommit<T> {
    /// mutation closureが返した値。
    pub value: T,
    identity: SessionIdentity,
}

impl<T> SessionCommit<T> {
    /// commit後のidentityを返す。
    #[must_use]
    pub const fn identity(&self) -> &SessionIdentity {
        &self.identity
    }

    /// commit後のsession versionを返す。
    #[must_use]
    pub const fn version(&self) -> SessionVersion {
        self.identity.version()
    }
}

/// projectが開かれていないときのsnapshot失敗。
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
pub enum ProjectSessionStateError {
    #[error("no project is open")]
    NoProjectOpen,
}

/// diskから検証済みの値をまとめた、open commit前のsession材料。
#[derive(Debug)]
pub struct PreparedProjectSession {
    root: ProjectRoot,
    config: Config,
    labels: LabelRegistry,
    milestones: MilestoneRegistry,
    tasks: HashMap<PathBuf, Task>,
    load_warnings: Vec<ProjectLoadWarning>,
}

impl PreparedProjectSession {
    /// 既存loaderが返したvalid valuesを一組にまとめる。
    pub fn new(
        root: ProjectRoot,
        config: Config,
        labels: LabelRegistry,
        milestones: MilestoneRegistry,
        tasks: HashMap<PathBuf, Task>,
    ) -> Self {
        Self::new_with_warnings(root, config, labels, milestones, tasks, Vec::new())
    }

    /// load warning を伴う open 用の prepared session を作る。
    pub fn new_with_warnings(
        root: ProjectRoot,
        config: Config,
        labels: LabelRegistry,
        milestones: MilestoneRegistry,
        tasks: HashMap<PathBuf, Task>,
        load_warnings: Vec<ProjectLoadWarning>,
    ) -> Self {
        Self {
            root,
            config,
            labels,
            milestones,
            tasks,
            load_warnings,
        }
    }

    /// 採番済みIDを付け、初期revisionのsessionへ変換する。
    #[must_use]
    pub fn into_session(self, session_id: SessionId) -> ProjectSession {
        ProjectSession {
            id: session_id,
            revision: SessionRevision::INITIAL,
            root: self.root,
            config: self.config,
            labels: self.labels,
            milestones: self.milestones,
            tasks: self.tasks,
            load_warnings: self.load_warnings,
        }
    }
}

/// 現在開いているprojectのcoherentなdomain state。
#[derive(Debug)]
pub struct ProjectSession {
    id: SessionId,
    revision: SessionRevision,
    root: ProjectRoot,
    config: Config,
    labels: LabelRegistry,
    milestones: MilestoneRegistry,
    tasks: HashMap<PathBuf, Task>,
    load_warnings: Vec<ProjectLoadWarning>,
}

impl ProjectSession {
    /// 現在のsession versionを返す。
    #[must_use]
    pub const fn version(&self) -> SessionVersion {
        SessionVersion {
            session_id: self.id,
            revision: self.revision,
        }
    }

    /// 現在のproject rootとversionからidentityを作る。
    #[must_use]
    pub fn identity(&self) -> SessionIdentity {
        SessionIdentity {
            project_root: self.root.clone(),
            version: self.version(),
        }
    }

    /// 全domain fieldを同じrevisionのsnapshotへcloneする。
    #[must_use]
    pub fn snapshot(&self) -> ProjectSessionSnapshot {
        ProjectSessionSnapshot {
            version: self.version(),
            root: self.root.clone(),
            config: self.config.clone(),
            labels: self.labels.clone(),
            milestones: self.milestones.clone(),
            tasks: self.tasks.clone(),
            load_warnings: self.load_warnings.clone(),
        }
    }

    /// 互換adapterがproject rootを同じdomain lock内で差し替える。
    #[cfg(test)]
    pub(crate) fn replace_project_root(&mut self, root: ProjectRoot) {
        self.root = root;
    }

    /// 互換adapterまたはcommit closureがconfigを差し替える。
    pub(crate) fn replace_config(&mut self, config: Config) {
        self.config = config;
    }

    /// 互換adapterまたはcommit closureがlabel registryを差し替える。
    pub(crate) fn replace_labels(&mut self, labels: LabelRegistry) {
        self.labels = labels;
    }

    /// 互換adapterまたはcommit closureがmilestone registryを差し替える。
    pub(crate) fn replace_milestones(&mut self, milestones: MilestoneRegistry) {
        self.milestones = milestones;
    }

    /// 互換adapterまたはcommit closureがtask mapを差し替える。
    pub(crate) fn replace_tasks(&mut self, tasks: HashMap<PathBuf, Task>) {
        self.tasks = tasks;
    }

    /// task map と load warnings を同じ session commit で置き換える。
    pub(crate) fn replace_tasks_and_load_warnings(
        &mut self,
        tasks: HashMap<PathBuf, Task>,
        load_warnings: Vec<ProjectLoadWarning>,
    ) {
        self.tasks = tasks;
        self.load_warnings = load_warnings;
    }

    /// 互換adapterまたはcommit closureへtask mapの可変参照を渡す。
    pub(crate) fn tasks_mut(&mut self) -> &mut HashMap<PathBuf, Task> {
        &mut self.tasks
    }

    /// writer境界テスト用にsession-local revisionを直接設定する。
    #[cfg(test)]
    pub(crate) fn seed_revision_for_test(&mut self, revision: SessionRevision) {
        self.revision = revision;
    }

    /// 1回のin-memory mutationを適用し、revisionを進める。
    pub(crate) fn commit<T>(
        &mut self,
        expected: &SessionIdentity,
        apply: impl FnOnce(&mut Self) -> T,
    ) -> Result<SessionCommit<T>, ProjectSessionCommitError> {
        ensure_identity_matches(expected, Some(self.identity()))?;
        let next_revision = self.revision.checked_next()?;
        let value = apply(self);
        self.revision = next_revision;

        Ok(SessionCommit {
            value,
            identity: self.identity(),
        })
    }
}

/// reader/writerが一度のdomain lock取得で読むimmutable snapshot。
#[derive(Clone, Debug)]
pub struct ProjectSessionSnapshot {
    version: SessionVersion,
    root: ProjectRoot,
    config: Config,
    labels: LabelRegistry,
    milestones: MilestoneRegistry,
    tasks: HashMap<PathBuf, Task>,
    load_warnings: Vec<ProjectLoadWarning>,
}

impl ProjectSessionSnapshot {
    /// snapshotを構成したsession versionを返す。
    #[must_use]
    pub const fn version(&self) -> SessionVersion {
        self.version
    }

    /// snapshotのproject rootを返す。
    pub fn project_root(&self) -> &ProjectRoot {
        &self.root
    }

    /// snapshotの設定を返す。
    pub fn config(&self) -> &Config {
        &self.config
    }

    /// snapshotのlabel registryを返す。
    pub fn labels(&self) -> &LabelRegistry {
        &self.labels
    }

    /// snapshotのmilestone registryを返す。
    pub fn milestones(&self) -> &MilestoneRegistry {
        &self.milestones
    }

    /// snapshotのtask mapを返す。
    pub fn tasks(&self) -> &HashMap<PathBuf, Task> {
        &self.tasks
    }

    /// snapshot 時点の project load warnings を返す。
    pub fn load_warnings(&self) -> &[ProjectLoadWarning] {
        &self.load_warnings
    }

    /// project rootとversionを持つcommit比較用identityを作る。
    #[must_use]
    pub fn identity(&self) -> SessionIdentity {
        SessionIdentity {
            project_root: self.root.clone(),
            version: self.version,
        }
    }

    /// snapshotがexpected identityと一致するか検証する。
    pub fn ensure_identity(&self, expected: &SessionIdentity) -> Result<(), SessionConflict> {
        ensure_identity_matches(expected, Some(self.identity()))
    }

    /// target lookup時と同じopen sessionかを検証する。
    ///
    /// 同一session内で他writerがrevisionを進めていても成功し、project switchまたは
    /// same-path reopenでSessionIdが変わった場合だけtyped conflictを返す。
    pub fn ensure_same_session(&self, expected: &SessionIdentity) -> Result<(), SessionConflict> {
        let actual = self.identity();
        if actual.is_same_session(expected) {
            return Ok(());
        }
        Err(SessionConflict::between(expected, Some(actual)))
    }
}

impl ProjectState {
    /// Loaded sessionのcoherent snapshotを返す。
    pub fn snapshot(&self) -> Result<ProjectSessionSnapshot, ProjectSessionStateError> {
        match self {
            Self::Idle => Err(ProjectSessionStateError::NoProjectOpen),
            Self::Loaded(session) => Ok(session.snapshot()),
        }
    }

    /// Loaded session のidentityを返す。Idleはactive sessionを持たない。
    #[must_use]
    pub fn active_identity(&self) -> Option<SessionIdentity> {
        match self {
            Self::Idle => None,
            Self::Loaded(session) => Some(session.identity()),
        }
    }

    /// expected identityがcurrent stateと一致するかを副作用なしで検証する。
    pub(crate) fn ensure_identity(
        &self,
        expected: &SessionIdentity,
    ) -> Result<(), SessionConflict> {
        ensure_identity_matches(expected, self.active_identity())
    }

    /// expected identityがcurrent sessionと一致するときだけmutationをcommitする。
    ///
    /// Idleも`actual: None`のtyped conflictとして扱い、closureは実行しない。
    pub(crate) fn commit<T>(
        &mut self,
        expected: &SessionIdentity,
        apply: impl FnOnce(&mut ProjectSession) -> T,
    ) -> Result<SessionCommit<T>, ProjectSessionCommitError> {
        match self {
            Self::Idle => Err(SessionConflict::between(expected, None).into()),
            Self::Loaded(session) => session.commit(expected, apply),
        }
    }
}

#[cfg(test)]
#[path = "aggregate_tests.rs"]
mod aggregate_tests;
