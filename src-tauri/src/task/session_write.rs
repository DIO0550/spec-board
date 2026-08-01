//! task writer共通のresident commitとsame-session conflict recovery。

use std::path::PathBuf;

use spec_board_fs::watcher::write_ignore::WriteIgnoreRegistry;

use crate::project::project_root::ProjectRoot;
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::project_session::{ProjectSession, SessionIdentity};
use crate::state::{AppState, SessionResourceAccess, SessionWriteError};

/// commandが登録したwrite-ignore markerをbest-effortで解除する。
pub(crate) fn cleanup_registered_write_ignores(
    registry: &WriteIgnoreRegistry,
    registered_paths: &[PathBuf],
) {
    for path in registered_paths {
        let _ = registry.unregister(path);
    }
}

/// disk成功後のresident commitを行い、conflict時は同じwrite lease内で再同期する。
///
/// recovery成功時はwatcherが自前write eventを1回consumeできるようmarkerを維持する。
/// recovery失敗またはconflict以外のcommit失敗ではmarkerを解除する。
#[allow(clippy::too_many_arguments)]
pub(crate) fn commit_or_resync_under_lease<T, E>(
    state: &AppState,
    lease_root: &ProjectRoot,
    expected: &SessionIdentity,
    resources: &SessionResourceAccess,
    registered_paths: &[PathBuf],
    resync_source: ResyncSource<'_>,
    operation_name: &str,
    apply: impl FnOnce(&mut ProjectSession) -> T,
) -> Result<T, E>
where
    E: From<SessionWriteError>,
{
    match state.commit_session_write(expected, apply) {
        Ok(committed) => Ok(committed.value),
        Err(SessionWriteError::Conflict(conflict)) => {
            if let Err(recovery) =
                resync_if_same_project_under_lease(state, lease_root, &conflict, resync_source)
            {
                cleanup_registered_write_ignores(resources.write_ignore(), registered_paths);
                log::warn!("{operation_name} conflict recovery failed: {recovery}");
            }
            Err(E::from(SessionWriteError::Conflict(conflict)))
        }
        Err(error) => {
            cleanup_registered_write_ignores(resources.write_ignore(), registered_paths);
            Err(E::from(error))
        }
    }
}
