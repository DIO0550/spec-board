//! resident state の lock 所有と取得順序を閉じ込める private module。
//!
//! domain と resources を同時に取得する経路は、必ず [`DomainGuard`] を経由して
//! [`DomainGuard::lock_resources`] を呼ぶ。background cache は値 API だけを公開し、
//! guard を caller へ返さない。

use std::collections::HashMap;
use std::ops::{Deref, DerefMut};
use std::sync::{Mutex, MutexGuard};

use crate::project::project_root::ProjectRoot;
use crate::project_session::{ProjectSession, ProjectState, SessionVersion};

use super::active_project_resources::{ActiveProjectResources, SessionResourceAccess};
use super::{AppStateError, ResourceAccessError, SessionResourceConflict};

/// resident domain/resources と background cache の raw mutex 所有者。
pub(super) struct StateLocks {
    domain: Mutex<ProjectState>,
    resources: Mutex<Option<ActiveProjectResources>>,
    background_sessions: Mutex<HashMap<ProjectRoot, ProjectSession>>,
}

impl StateLocks {
    /// すべての resident state を空で初期化する。
    pub(super) fn new() -> Self {
        Self {
            domain: Mutex::new(ProjectState::Idle),
            resources: Mutex::new(None),
            background_sessions: Mutex::new(HashMap::new()),
        }
    }

    /// domain lock を取得し、resources へ進める段階 guard を返す。
    pub(super) fn lock_domain(&self) -> Result<DomainGuard<'_>, AppStateError> {
        let domain = self
            .domain
            .lock()
            .map_err(|_| AppStateError::DomainLockPoisoned)?;
        Ok(DomainGuard {
            domain,
            resources: &self.resources,
        })
    }

    /// expected version と一致する session-scoped resources の値だけを返す。
    pub(super) fn resources_for(
        &self,
        expected: SessionVersion,
    ) -> Result<SessionResourceAccess, ResourceAccessError> {
        let resources = self
            .resources
            .lock()
            .map_err(|_| AppStateError::ResourceLockPoisoned)?;
        let Some(active) = resources.as_ref() else {
            return Err(SessionResourceConflict::new(expected, None).into());
        };
        if active.version() != expected {
            return Err(SessionResourceConflict::new(expected, Some(active.version())).into());
        }
        Ok(active.session_access())
    }

    /// exact root に一致する background session を cache から取り出す。
    pub(super) fn take_background_session(
        &self,
        root: &ProjectRoot,
    ) -> Result<Option<ProjectSession>, AppStateError> {
        self.background_sessions
            .lock()
            .map_err(|_| AppStateError::BackgroundSessionsLockPoisoned)
            .map(|mut sessions| sessions.remove(root))
    }

    /// background cache へ session を保存し、新しい SessionId を優先する。
    pub(super) fn stash_background_session(
        &self,
        session: ProjectSession,
    ) -> Result<(), AppStateError> {
        use std::collections::hash_map::Entry;

        let root = session.identity().project_root().clone();
        let mut sessions = self
            .background_sessions
            .lock()
            .map_err(|_| AppStateError::BackgroundSessionsLockPoisoned)?;
        match sessions.entry(root) {
            Entry::Vacant(entry) => {
                entry.insert(session);
            }
            Entry::Occupied(mut entry) => {
                if entry.get().version().session_id < session.version().session_id {
                    entry.insert(session);
                }
            }
        }
        Ok(())
    }

    /// test から background cache lock を poison する。
    #[cfg(test)]
    pub(super) fn poison_background_sessions_for_test(&self) {
        let _guard = self.background_sessions.lock();
        panic!("poison background session cache");
    }

    /// test から resources lock を poison する。
    #[cfg(test)]
    pub(super) fn poison_resources_for_test(&self) {
        let _guard = self.resources.lock().expect("lock before poison");
        panic!("poison resources");
    }

    /// test assertion 用に active resource version を値として返す。
    #[cfg(test)]
    pub(super) fn active_resource_version_for_test(&self) -> Option<SessionVersion> {
        self.resources
            .lock()
            .expect("resource lock")
            .as_ref()
            .map(ActiveProjectResources::version)
    }
}

/// domain lock を保持し、resources lock への順序付き入口を所有する guard。
pub(super) struct DomainGuard<'a> {
    domain: MutexGuard<'a, ProjectState>,
    resources: &'a Mutex<Option<ActiveProjectResources>>,
}

impl<'a> DomainGuard<'a> {
    /// domain を保持したまま resources lock を取得する。
    pub(super) fn lock_resources(self) -> Result<ResidentGuards<'a>, AppStateError> {
        let resources = self
            .resources
            .lock()
            .map_err(|_| AppStateError::ResourceLockPoisoned)?;
        Ok(ResidentGuards {
            domain: self.domain,
            resources,
        })
    }
}

impl Deref for DomainGuard<'_> {
    type Target = ProjectState;

    fn deref(&self) -> &Self::Target {
        &self.domain
    }
}

impl DerefMut for DomainGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.domain
    }
}

/// domain → resources の順で取得済みの resident guard pair。
pub(super) struct ResidentGuards<'a> {
    domain: MutexGuard<'a, ProjectState>,
    resources: MutexGuard<'a, Option<ActiveProjectResources>>,
}

impl ResidentGuards<'_> {
    /// domain state を可変参照する。
    pub(super) fn domain_mut(&mut self) -> &mut ProjectState {
        &mut self.domain
    }

    /// active resources を共有参照する。
    pub(super) fn resources(&self) -> &Option<ActiveProjectResources> {
        &self.resources
    }

    /// active resources を可変参照する。
    pub(super) fn resources_mut(&mut self) -> &mut Option<ActiveProjectResources> {
        &mut self.resources
    }
}
