//! `create_label_impl` / `LabelRegistry::plan_create_label` / `From<CreateLabelArgs>` のテスト。

use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use tempfile::TempDir;

use super::{create_label_impl, create_label_impl_with_store, CreateLabelArgs, CreateLabelError};
use crate::config::clock::FixedClock;
use crate::config::{
    label_registry_store, LabelColor, LabelDefinition, LabelGroup, LabelRegistry,
    LabelRegistryStore, LoadLabelsError, SaveLabelsError,
};
use crate::config::{Config, MilestoneRegistry};
use crate::project_session::SessionRevision;
use crate::state::{AppState, AppStateError, SessionWriteError};

const FIXED_NOW: &str = "2026-05-31T12:00:00Z";

fn fixed_clock() -> FixedClock {
    FixedClock::new(FIXED_NOW)
}

fn args(name: &str) -> CreateLabelArgs {
    CreateLabelArgs {
        name: name.to_string(),
        description: None,
        group: None,
        color: None,
    }
}

fn definition(name: &str) -> LabelDefinition {
    LabelDefinition {
        name: name.to_string(),
        description: None,
        group: None,
        color: None,
        updated: None,
    }
}

fn opened_state(root: &Path, registry: LabelRegistry) -> AppState {
    let state = AppState::new();
    state.install_test_project(
        root,
        Config::default(),
        registry,
        MilestoneRegistry::default(),
        Vec::new(),
    );
    state
}

struct ConflictAfterSaveLabelStore<'a> {
    state: &'a AppState,
    stored: Mutex<LabelRegistry>,
    save_calls: AtomicUsize,
    load_calls: AtomicUsize,
}

impl<'a> ConflictAfterSaveLabelStore<'a> {
    fn new(state: &'a AppState) -> Self {
        Self {
            state,
            stored: Mutex::new(LabelRegistry::default()),
            save_calls: AtomicUsize::new(0),
            load_calls: AtomicUsize::new(0),
        }
    }
}

impl LabelRegistryStore for ConflictAfterSaveLabelStore<'_> {
    fn load(&self) -> Result<LabelRegistry, LoadLabelsError> {
        self.load_calls.fetch_add(1, Ordering::SeqCst);
        Ok(self.stored.lock().expect("fake store lock").clone())
    }

    fn save(&self, registry: &LabelRegistry) -> Result<(), SaveLabelsError> {
        self.save_calls.fetch_add(1, Ordering::SeqCst);
        *self.stored.lock().expect("fake store lock") = registry.clone();
        let identity = self
            .state
            .active_session_identity()
            .expect("active session identity");
        self.state
            .commit_session_write(&identity, |_| ())
            .expect("inject concurrent revision");
        Ok(())
    }
}

// ───────── plan_create_label（純粋ロジック） ─────────

#[test]
fn plan_appends_new_label() {
    let registry = LabelRegistry::default();
    let next = registry
        .plan_create_label(definition("bug"), &fixed_clock())
        .expect("create ok");
    assert_eq!(next.labels.len(), 1);
    assert_eq!(next.labels[0].name, "bug");
}

#[test]
fn plan_sets_updated_from_clock() {
    let next = LabelRegistry::default()
        .plan_create_label(definition("bug"), &fixed_clock())
        .expect("create ok");
    assert_eq!(next.labels[0].updated.as_deref(), Some(FIXED_NOW));
}

#[test]
fn plan_preserves_existing_labels() {
    let registry = LabelRegistry {
        labels: vec![definition("feat")],
    };
    let next = registry
        .plan_create_label(definition("bug"), &fixed_clock())
        .expect("create ok");
    let names: Vec<&str> = next.labels.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, vec!["feat", "bug"]);
}

#[test]
fn plan_allows_optional_fields_unset() {
    let next = LabelRegistry::default()
        .plan_create_label(definition("bug"), &fixed_clock())
        .expect("create ok");
    let label = &next.labels[0];
    assert!(label.description.is_none());
    assert!(label.group.is_none());
    assert!(label.color.is_none());
}

#[test]
fn plan_rejects_duplicate_name() {
    let registry = LabelRegistry {
        labels: vec![definition("bug")],
    };
    let err = registry
        .plan_create_label(definition("bug"), &fixed_clock())
        .expect_err("duplicate rejected");
    assert!(matches!(
        err,
        crate::config::LabelValidationError::DuplicateLabelName { .. }
    ));
}

#[test]
fn plan_rejects_empty_name() {
    let err = LabelRegistry::default()
        .plan_create_label(definition(""), &fixed_clock())
        .expect_err("empty rejected");
    assert!(matches!(
        err,
        crate::config::LabelValidationError::EmptyLabelName
    ));
}

// ───────── From<CreateLabelArgs>（lenient 変換） ─────────

#[test]
fn from_args_lenient_color_invalid_hex_is_none() {
    let mut a = args("bug");
    a.color = Some("red".to_string());
    let def = LabelDefinition::from(a);
    assert!(def.color.is_none());
}

#[test]
fn from_args_valid_hex_color_is_some() {
    let mut a = args("bug");
    a.color = Some("#1A2B3C".to_string());
    let def = LabelDefinition::from(a);
    assert_eq!(def.color.as_ref().map(LabelColor::as_str), Some("#1A2B3C"));
}

#[test]
fn from_args_empty_group_is_none() {
    let mut a = args("bug");
    a.group = Some(String::new());
    let def = LabelDefinition::from(a);
    assert!(def.group.is_none());
}

#[test]
fn from_args_group_wraps_label_group() {
    let mut a = args("bug");
    a.group = Some("type".to_string());
    let def = LabelDefinition::from(a);
    assert_eq!(def.group.as_ref().map(LabelGroup::as_str), Some("type"));
}

// ───────── create_label_impl（effect 層） ─────────

#[test]
fn impl_creates_label_and_persists() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());

    create_label_impl(&state, args("bug"), &fixed_clock()).expect("create ok");

    // disk へ反映。
    let on_disk = label_registry_store(tmp.path()).load().expect("load");
    assert_eq!(on_disk.labels.len(), 1);
    assert_eq!(on_disk.labels[0].name, "bug");
    assert_eq!(on_disk.labels[0].updated.as_deref(), Some(FIXED_NOW));
    // in-memory へ commit。
    let in_mem = state.test_labels().expect("labels").expect("some");
    assert_eq!(in_mem.labels.len(), 1);
}

#[test]
fn impl_creates_file_when_absent() {
    let tmp = TempDir::new().unwrap();
    // labels.yml は存在しない状態（空レジストリで open）。
    let state = opened_state(tmp.path(), LabelRegistry::default());

    create_label_impl(&state, args("bug"), &fixed_clock()).expect("create ok");

    assert!(tmp.path().join(".spec-board").join("labels.yml").exists());
}

#[test]
fn revision_exhaustion_performs_no_disk_write_and_keeps_labels_unchanged() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));
    let before = state
        .session_snapshot()
        .expect("snapshot lock")
        .expect("loaded snapshot");

    let error =
        create_label_impl(&state, args("bug"), &fixed_clock()).expect_err("revision exhaustion");

    assert!(matches!(
        error,
        CreateLabelError::SessionWrite(SessionWriteError::RevisionExhausted(_))
    ));
    assert!(!tmp.path().join(".spec-board").join("labels.yml").exists());
    let after = state
        .session_snapshot()
        .expect("snapshot lock")
        .expect("loaded snapshot");
    assert_eq!(after.version(), before.version());
    assert_eq!(after.labels(), before.labels());
}

#[test]
fn disk_success_conflict_resync_uses_the_same_injected_label_store() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(tmp.path(), LabelRegistry::default());
    let target = state.active_session_identity().expect("active identity");
    let store = ConflictAfterSaveLabelStore::new(&state);

    let error = create_label_impl_with_store(&state, &target, &store, args("bug"), &fixed_clock())
        .expect_err("original conflict");

    assert!(matches!(
        error,
        CreateLabelError::SessionWrite(SessionWriteError::Conflict(_))
    ));
    assert_eq!(1, store.save_calls.load(Ordering::SeqCst));
    assert_eq!(1, store.load_calls.load(Ordering::SeqCst));
    let labels = state
        .test_labels()
        .expect("labels lock")
        .expect("loaded labels");
    assert_eq!(
        vec!["bug"],
        labels
            .labels
            .iter()
            .map(|label| label.name.as_str())
            .collect::<Vec<_>>()
    );
}

#[test]
fn impl_returns_no_project_open() {
    let state = AppState::new();
    let err = create_label_impl(&state, args("bug"), &fixed_clock()).expect_err("no project");
    assert!(matches!(err, CreateLabelError::NoProjectOpen));
}

#[test]
fn from_app_state_error_maps_to_state_lock_poisoned() {
    // lock poison は state 層で `AppStateError::LockPoisoned` として検出され、
    // command 層は `From` でこれを `StateLockPoisoned` に変換する（文字列契約一致）。
    let err: CreateLabelError = AppStateError::LockPoisoned.into();
    assert!(matches!(err, CreateLabelError::StateLockPoisoned));
    assert_eq!(err.to_string(), "内部状態のロックが破損しました");
}

#[test]
fn impl_no_commit_on_duplicate_name() {
    let tmp = TempDir::new().unwrap();
    let state = opened_state(
        tmp.path(),
        LabelRegistry {
            labels: vec![definition("bug")],
        },
    );

    let err = create_label_impl(&state, args("bug"), &fixed_clock()).expect_err("duplicate");
    assert!(matches!(err, CreateLabelError::Validation(_)));
    // in-memory は変化しない（1 件のまま）。
    let in_mem = state.test_labels().expect("labels").expect("some");
    assert_eq!(in_mem.labels.len(), 1);
    // labels.yml は書き込まれていない。
    assert!(!tmp.path().join(".spec-board").join("labels.yml").exists());
}

#[test]
fn no_project_open_display_matches_contract() {
    assert_eq!(
        CreateLabelError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}

// ───────── fixture: identity round-trip ─────────

#[test]
fn fixture_identity_cases_round_trip_raw_names() {
    use crate::config::label_name_fixture::load_fixture;
    let f = load_fixture();
    for case in &f.identity_cases {
        let a = CreateLabelArgs {
            name: case.name.clone(),
            description: None,
            group: None,
            color: None,
        };
        let def: LabelDefinition = a.into();
        assert_eq!(
            def.name, case.name,
            "create round-trip failed for case '{}'",
            case.id
        );
    }
}

#[test]
fn fixture_duplicate_pairs_reject_only_exact_matches() {
    use crate::config::label_name_fixture::load_fixture;
    let f = load_fixture();
    for pair in &f.duplicate_pairs {
        let mut reg = LabelRegistry::default();
        reg.labels.push(LabelDefinition {
            name: pair.existing.clone(),
            description: None,
            group: None,
            color: None,
            updated: None,
        });
        let result = reg.plan_create_label(
            LabelDefinition {
                name: pair.candidate.clone(),
                description: None,
                group: None,
                color: None,
                updated: None,
            },
            &fixed_clock(),
        );
        if pair.exact_duplicate {
            assert!(
                result.is_err(),
                "pair '{}': exact duplicate should be rejected",
                pair.id
            );
        } else {
            assert!(
                result.is_ok(),
                "pair '{}': non-exact should be accepted, got {:?}",
                pair.id,
                result.err()
            );
        }
    }
}
