//! FE へ渡す watcher session の snapshot。
//!
//! `open_project` / `get_tasks` の**どちらの応答でも同じ形**で返す。FE はこれを
//! envelope 検証の baseline にする。VO ではなく 4 つの VO を束ねる DTO なので、
//! ここだけ `#[serde(rename_all = "camelCase")]`（IPC DTO 規約）を付ける。
//!
//! # 構築経路
//!
//! 本 DTO は **`AppState::session_snapshot` のトランザクショナルな snapshot からのみ**作られる。
//! 3 つの atomic を後から個別に読む API を置くと torn read になり、
//! 「tasks は古いが session は新しい」snapshot が FE に渡って、新しい envelope が
//! stale として捨てられる。

use serde::{Deserialize, Serialize};

use crate::project_session::ProjectSessionSnapshot;

use super::event_seq::EventSeq;
use super::project_generation::ProjectGeneration;
use super::project_key::ProjectKey;
use super::tasks_revision::TasksRevision;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatcherSession {
    pub project_key: ProjectKey,
    pub generation: ProjectGeneration,
    pub revision: TasksRevision,
    pub event_seq: EventSeq,
}

impl WatcherSession {
    /// coherentなproject snapshotを既存wire shapeへ変換する。
    pub(crate) fn from_snapshot(snapshot: &ProjectSessionSnapshot, event_seq: EventSeq) -> Self {
        Self {
            project_key: ProjectKey::from_root(snapshot.project_root().as_path()),
            generation: ProjectGeneration::from_raw(snapshot.version().session_id.as_u64()),
            revision: TasksRevision::from_raw(snapshot.version().revision.as_u64()),
            event_seq,
        }
    }

    /// project未open時の互換baselineを返す。
    pub(crate) fn idle() -> Self {
        Self {
            project_key: ProjectKey::from_root(std::path::Path::new("")),
            generation: ProjectGeneration::from_raw(0),
            revision: TasksRevision::from_raw(0),
            event_seq: EventSeq::from_raw(0),
        }
    }
}

#[cfg(test)]
#[path = "watcher_session_tests.rs"]
mod watcher_session_tests;
