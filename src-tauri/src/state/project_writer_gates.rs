//! exact [`ProjectRoot`] ごとの writer 直列化 gate。
//!
//! テーブル自身は [`Weak`] だけを保持するため、利用中でない project の gate を
//! `AppState` が永続的に保持しない。path の canonicalize は行わず、session が保持する
//! raw [`ProjectRoot`] をそのまま key にする。

use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};

use crate::project::project_root::ProjectRoot;

use super::AppStateError;

/// project root ごとの非再入 writer mutex を管理するテーブル。
pub(crate) struct ProjectWriterGates {
    gates: Mutex<HashMap<ProjectRoot, Weak<Mutex<()>>>>,
}

impl ProjectWriterGates {
    /// 空の gate table を作る。
    pub(crate) fn new() -> Self {
        Self {
            gates: Mutex::new(HashMap::new()),
        }
    }

    /// 同じ exact root には同一 gate、異なる root には独立 gate を返す。
    pub(crate) fn gate_for(&self, root: &ProjectRoot) -> Result<Arc<Mutex<()>>, AppStateError> {
        let mut gates = self
            .gates
            .lock()
            .map_err(|_| AppStateError::WriterGateTablePoisoned)?;

        gates.retain(|_, gate| gate.strong_count() > 0);
        if let Some(gate) = gates.get(root).and_then(Weak::upgrade) {
            return Ok(gate);
        }

        let gate = Arc::new(Mutex::new(()));
        gates.insert(root.clone(), Arc::downgrade(&gate));
        Ok(gate)
    }

    #[cfg(test)]
    pub(super) fn entry_count(&self) -> usize {
        self.gates
            .lock()
            .expect("gate table must be readable")
            .len()
    }

    #[cfg(test)]
    pub(super) fn poison_for_testing(&self) {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            std::thread::scope(|scope| {
                scope.spawn(|| {
                    let _guard = self.gates.lock().expect("lock before poison");
                    panic!("poison writer gate table");
                });
            });
        }));
    }
}

#[cfg(test)]
#[path = "project_writer_gates_tests.rs"]
mod project_writer_gates_tests;
