//! project root を一意に指す識別子の Value Object。
//!
//! 同一 path を再オープンした場合は同じ値になるため、世代の判定は
//! [`super::project_generation::ProjectGeneration`] と**組で**行うこと
//! （本 VO 単独では旧セッションを弾けない）。
//!
//! FE にも `projectKey` という語があるが、あちらは「loaded path」
//! （`open_project` へ渡した raw 文字列）を指す別物。本 VO は `AppState` が
//! 保持する `PathBuf` 由来で、`canonicalize()` 適用有無まで含めた厳密一致は
//! 仮定しない。

use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProjectKey(String);

impl ProjectKey {
    /// project root から識別子を作る。
    ///
    /// 非 UTF-8 path は lossy 変換で受け入れる。`Err` を返す設計にすると
    /// 「project は開けたのに watcher event だけ identity を持てない」状態が
    /// でき、FE の破棄判定が機能しなくなる。
    pub fn from_root(root: &Path) -> Self {
        Self(root.to_string_lossy().into_owned())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[cfg(test)]
#[path = "project_key_tests.rs"]
mod project_key_tests;
