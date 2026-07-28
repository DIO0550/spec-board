//! emit 連番を表す Value Object。emit 1 回につき 1 つ消費する。
//!
//! **`AppHandle::emit` に失敗しても消費する**（`watcher_event` は emit 失敗を
//! log して握り潰すため、そもそも成否を戻せない）。結果として欠番が生じるが、
//! FE はこれを gap として検知し自動再取得で復旧する — board が静かに古いまま
//! になるよりも安全側に倒す設計判断。
//!
//! 消費は単一の adapter スレッドからのみ行われるため、atomic に要求するのは
//! `fetch_add` の戻り値の一意性だけで、順序に依存する保証は無い。
//!
//! # overflow について
//!
//! [`super::project_generation::ProjectGeneration`] と同じ理由で上限到達は
//! 到達不能として扱う。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct EventSeq(u64);

impl EventSeq {
    pub fn from_raw(value: u64) -> Self {
        Self(value)
    }

    pub fn as_u64(self) -> u64 {
        self.0
    }
}

#[cfg(test)]
#[path = "event_seq_tests.rs"]
mod event_seq_tests;
