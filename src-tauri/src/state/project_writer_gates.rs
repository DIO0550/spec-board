//! exact [`ProjectRoot`] ごとの writer 直列化 gate。
//!
//! テーブル自身は [`Weak`] だけを保持するため、利用中でない project の gate を
//! `AppState` が永続的に保持しない。path の canonicalize は行わず、session が保持する
//! raw [`ProjectRoot`] をそのまま key にする。

use std::cell::Cell;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, Weak};

use crate::project::project_root::ProjectRoot;

use super::AppStateError;

thread_local! {
    /// 同一 thread 内で writer lease を保持しているか。
    static WRITER_LEASE_ACTIVE: Cell<bool> = const { Cell::new(false) };
}

/// thread-local marker を unwind 時にも必ず解除する RAII guard。
struct WriterLeaseMarker;

impl WriterLeaseMarker {
    /// writer lease へ入る。同一 thread の再入は root に関係なく拒否する。
    fn enter() -> Result<Self, AppStateError> {
        WRITER_LEASE_ACTIVE.with(|active| {
            if active.get() {
                return Err(AppStateError::WriterLeaseReentrant);
            }
            active.set(true);
            Ok(Self)
        })
    }
}

impl Drop for WriterLeaseMarker {
    fn drop(&mut self) {
        WRITER_LEASE_ACTIVE.with(|active| active.set(false));
    }
}

/// project root ごとの非再入 writer mutex を管理するテーブル。
pub(crate) struct ProjectWriterGates {
    gates: Mutex<HashMap<ProjectRoot, Weak<Mutex<()>>>>,
    #[cfg(test)]
    poisoned_gates: Mutex<Vec<Arc<Mutex<()>>>>,
}

impl ProjectWriterGates {
    /// 空の gate table を作る。
    pub(crate) fn new() -> Self {
        Self {
            gates: Mutex::new(HashMap::new()),
            #[cfg(test)]
            poisoned_gates: Mutex::new(Vec::new()),
        }
    }

    /// 同じ exact root には同一 gate、異なる root には独立 gate を返す。
    fn gate_for(&self, root: &ProjectRoot) -> Result<Arc<Mutex<()>>, AppStateError> {
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

    /// exact-root writer lease の生存期間を closure に限定する。
    pub(crate) fn with_lease<T>(
        &self,
        root: &ProjectRoot,
        operation: impl FnOnce() -> T,
    ) -> Result<T, AppStateError> {
        let _marker = WriterLeaseMarker::enter()?;
        let gate = self.gate_for(root)?;
        let _guard = gate.lock().map_err(|_| AppStateError::WriterGatePoisoned)?;
        Ok(operation())
    }

    /// test から project 固有 gate を poison する。
    #[cfg(test)]
    pub(super) fn poison_gate_for_test(&self, root: &ProjectRoot) {
        let gate = self.gate_for(root).expect("writer gate");
        let keep_alive = Arc::clone(&gate);
        let _ = std::thread::spawn(move || {
            let _guard = gate.lock().expect("lock before poison");
            panic!("poison writer gate");
        })
        .join();
        self.poisoned_gates
            .lock()
            .expect("poisoned gate store")
            .push(keep_alive);
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
