//! テスト専用。cold open のハーネスを複数のテストファイルで共有する。

use std::path::Path;
use std::sync::Arc;

use crate::config::{label_registry_store, milestone_registry_store};
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::ProjectSessionSnapshot;
use crate::state::AppState;

/// tempdir の project を `open_project_impl` + `NoopWatcherFactory` で
/// コールドオープンし、確定した snapshot を返す。
///
/// disk watcher だけを no-op に差し替え、それ以外は production の open と同じ経路を通す。
pub(crate) fn open_from_disk(state: &Arc<AppState>, root: &Path) -> ProjectSessionSnapshot {
    let intent = OpenProjectIntent::try_from(root.to_str().expect("utf-8 path").to_string())
        .expect("valid intent");
    let labels_store = label_registry_store(intent.as_path());
    let milestones_store = milestone_registry_store(intent.as_path());
    open_project_impl(
        state,
        &intent,
        &labels_store,
        &milestones_store,
        &NoopWatcherFactory,
    )
    .expect("cold open succeeds");
    state
        .require_session_snapshot()
        .expect("session is installed")
}
