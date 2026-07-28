//! watcher の世代を表す Value Object。`open_project` の commit ごとに +1 される。
//!
//! `AppState` は生値を `AtomicU64` で保持し、公開境界では本 VO で返す。
//!
//! # overflow について
//!
//! `u64` の上限到達は現実的に起こらないため、bump 側で飽和処理を入れない。
//! 1 秒あたり 1 万回 `open_project` を成功させ続けても約 5,800 万年かかる。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProjectGeneration(u64);

impl ProjectGeneration {
    pub fn from_raw(value: u64) -> Self {
        Self(value)
    }

    pub fn as_u64(self) -> u64 {
        self.0
    }
}

#[cfg(test)]
#[path = "project_generation_tests.rs"]
mod project_generation_tests;
