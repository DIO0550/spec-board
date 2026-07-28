//! FE へ渡す watcher session の snapshot。
//!
//! `open_project` / `get_tasks` の**どちらの応答でも同じ形**で返す。FE はこれを
//! envelope 検証の baseline にする。VO ではなく 4 つの VO を束ねる DTO なので、
//! ここだけ `#[serde(rename_all = "camelCase")]`（IPC DTO 規約）を付ける。
//!
//! # 構築経路
//!
//! 本 DTO は **`AppState` のトランザクショナルなアクセサからのみ**作られる
//! （`install_project_session` / `snapshot_config_tasks_and_session`）。
//! 3 つの atomic を後から個別に読む API を置くと torn read になり、
//! 「tasks は古いが session は新しい」snapshot が FE に渡って、新しい envelope が
//! stale として捨てられる。

use serde::{Deserialize, Serialize};

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

#[cfg(test)]
#[path = "watcher_session_tests.rs"]
mod watcher_session_tests;
