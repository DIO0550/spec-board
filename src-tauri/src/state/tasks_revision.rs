//! `tasks_cache` の改訂番号を表す Value Object。
//!
//! この VO は旧 wire 形状との互換 adapter であり、resident の版管理は
//! `ProjectSession` の session-local `SessionRevision` が担う。
//! session-local revision は SessionId と組み合わせて project switch を識別する。
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
