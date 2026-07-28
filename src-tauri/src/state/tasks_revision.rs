//! `tasks_cache` の改訂番号を表す Value Object。
//!
//! cache を変更する 3 アクセサ（`with_tasks_cache_mut` / `replace_tasks_cache` /
//! `replace_config_and_tasks_if_project_matches`）の内部で +1 される。
//! **project を跨いで単調増加し、リセットしない**。リセットすると project の
//! 往復で同じ値が再出現し、FE が新しい cache を古い cache と誤判定する ABA に
//! なる。
//!
//! [`super::event_seq::EventSeq`] との役割分担: 本 VO は「cache の版」であり、
//! emit を伴わない mutation でも進む。したがって**連番の欠落判定には使えない**。
//!
//! # overflow について
//!
//! [`super::project_generation::ProjectGeneration`] と同じ理由で上限到達は
//! 到達不能として扱う。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct TasksRevision(u64);

impl TasksRevision {
    pub fn from_raw(value: u64) -> Self {
        Self(value)
    }

    pub fn as_u64(self) -> u64 {
        self.0
    }
}

#[cfg(test)]
#[path = "tasks_revision_tests.rs"]
mod tasks_revision_tests;
