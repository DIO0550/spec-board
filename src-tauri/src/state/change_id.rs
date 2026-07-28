//! 1 件の変更通知を識別する ID の Value Object。
//!
//! 新規依存（uuid crate 等）を増やさない方針のため、`(generation, eventSeq)` を
//! 合成して一意性を得る。両者とも単調増加なので衝突しない。
//!
//! # 用途
//!
//! **順序判定には使わない**（それは `revision` / `eventSeq` の役割）。BE の
//! `log::trace!` と FE の diagnostic 表示に同じ ID を出し、どの emit がどの通知に
//! 対応するかをログで突き合わせるための相関 ID。

use serde::{Deserialize, Serialize};

use super::event_seq::EventSeq;
use super::project_generation::ProjectGeneration;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ChangeId(String);

impl ChangeId {
    /// `"{generation}-{eventSeq}"` を組み立てる。
    pub fn compose(generation: ProjectGeneration, event_seq: EventSeq) -> Self {
        Self(format!("{}-{}", generation.as_u64(), event_seq.as_u64()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
#[path = "change_id_tests.rs"]
mod change_id_tests;
