use std::sync::Arc;

use crate::project::project_root::ProjectRoot;
use crate::state::AppStateError;

use super::ProjectWriterGates;

fn root(path: &str) -> ProjectRoot {
    ProjectRoot::try_from_str(path).expect("test root must be valid")
}

#[test]
fn same_exact_root_reuses_the_same_gate() {
    let gates = ProjectWriterGates::new();

    let first = gates.gate_for(&root("/tmp/project-a")).expect("gate");
    let second = gates.gate_for(&root("/tmp/project-a")).expect("gate");

    assert!(Arc::ptr_eq(&first, &second));
}

#[test]
fn different_raw_roots_have_independent_gates() {
    let gates = ProjectWriterGates::new();

    let absolute = gates.gate_for(&root("/tmp/project-a")).expect("gate");
    let relative = gates.gate_for(&root("./project-a")).expect("gate");

    assert!(!Arc::ptr_eq(&absolute, &relative));
}

#[test]
fn dead_weak_entries_are_cleaned_when_another_gate_is_requested() {
    let gates = ProjectWriterGates::new();
    let first_root = root("/tmp/project-a");

    let first = gates.gate_for(&first_root).expect("gate");
    assert_eq!(1, gates.entry_count());
    drop(first);

    let _second = gates
        .gate_for(&root("/tmp/project-b"))
        .expect("second gate");

    assert_eq!(1, gates.entry_count());
}

#[test]
fn poisoned_gate_table_returns_a_typed_error() {
    let gates = ProjectWriterGates::new();
    gates.poison_for_testing();

    let error = gates
        .gate_for(&root("/tmp/project-a"))
        .expect_err("poison must be reported");

    assert_eq!(AppStateError::WriterGateTablePoisoned, error);
}
