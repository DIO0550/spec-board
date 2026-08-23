//! `MilestoneRegistry` / `MilestoneDefinition` / `MilestoneState` /
//! `MilestoneRegistryStore`（`YamlMilestoneRegistryStore`）のユニットテスト。
//! deserialize 正規化・validate・aggregate `plan_*`（副作用ゼロ・PUT セマンティクス）・
//! lenient 境界（order 型 lenient / state 値 lenient / 空文字正規化）を網羅する。

use super::clock::FixedClock;
use super::{
    milestone_registry_store, DeleteMilestonePlanError, LoadMilestonesError, MilestoneDefinition,
    MilestoneRegistry, MilestoneRegistryStore, MilestoneState, MilestoneValidationError,
    SaveMilestonesError, UpdateMilestoneIntent, UpdateMilestonePlanError,
};
use tempfile::TempDir;

const FIXED_NOW: &str = "2026-06-03T12:00:00Z";

fn write_milestones_yml(root: &std::path::Path, content: &str) {
    let dir = root.join(".spec-board");
    std::fs::create_dir_all(&dir).expect("create .spec-board");
    std::fs::write(dir.join("milestones.yml"), content).expect("write milestones.yml");
}

fn definition(name: &str) -> MilestoneDefinition {
    MilestoneDefinition {
        name: name.to_string(),
        title: None,
        description: None,
        due: None,
        order: None,
        state: None,
        updated: None,
    }
}

#[test]
fn try_new_rejects_empty_and_exact_duplicate_names() {
    let empty = MilestoneRegistry::try_new(vec![definition("")]).unwrap_err();
    assert_eq!(empty, MilestoneValidationError::EmptyMilestoneName);

    let duplicate =
        MilestoneRegistry::try_new(vec![definition("v1"), definition("v1")]).unwrap_err();
    assert_eq!(
        duplicate,
        MilestoneValidationError::DuplicateMilestoneName {
            name: "v1".to_string(),
        }
    );
}

#[test]
fn try_new_preserves_whitespace_case_and_definition_order() {
    let registry = MilestoneRegistry::try_new(vec![
        definition("   "),
        definition("V1"),
        definition("v1"),
        definition(" v1 "),
    ])
    .expect("similar but non-identical names are valid");

    let names: Vec<&str> = registry
        .definitions()
        .iter()
        .map(|definition| definition.name.as_str())
        .collect();
    assert_eq!(names, vec!["   ", "V1", "v1", " v1 "]);
}

#[test]
fn direct_deserialize_rejects_invalid_registry() {
    let empty = serde_yaml_ng::from_str::<MilestoneRegistry>("milestones:\n  - name: \"\"\n");
    assert!(empty.is_err());

    let duplicate =
        serde_yaml_ng::from_str::<MilestoneRegistry>("milestones:\n  - name: v1\n  - name: v1\n");
    assert!(duplicate.is_err());
}

// ───────── load: 正常系 ─────────

#[test]
fn load_parses_definitions_with_all_fields() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(
        tmp.path(),
        "milestones:\n  - name: v0.3\n    title: v0.3 リリース\n    description: 基盤整備\n    due: \"2026-07-31\"\n    order: 0\n    state: open\n    updated: \"2026-06-03T12:00:00Z\"\n",
    );

    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    assert_eq!(registry.definitions().len(), 1);
    let m = &registry.definitions()[0];
    assert_eq!(m.name, "v0.3");
    assert_eq!(m.title.as_deref(), Some("v0.3 リリース"));
    assert_eq!(m.description.as_deref(), Some("基盤整備"));
    assert_eq!(m.due.as_deref(), Some("2026-07-31"));
    assert_eq!(m.order, Some(0));
    assert_eq!(m.state, Some(MilestoneState::Open));
    assert_eq!(m.updated.as_deref(), Some("2026-06-03T12:00:00Z"));
}

#[test]
fn load_preserves_definition_order() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(
        tmp.path(),
        "milestones:\n  - name: v0.4\n  - name: v0.3\n  - name: v1.0\n",
    );

    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    let names: Vec<&str> = registry
        .definitions()
        .iter()
        .map(|m| m.name.as_str())
        .collect();
    assert_eq!(names, vec!["v0.4", "v0.3", "v1.0"]);
}

#[test]
fn load_ignores_unknown_keys() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(
        tmp.path(),
        "version: 2\nmilestones:\n  - name: v0.3\n    futureField: ignored\n",
    );

    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    assert_eq!(registry.definitions().len(), 1);
    assert_eq!(registry.definitions()[0].name, "v0.3");
}

// ───────── load: 空相当 → Default ─────────

#[test]
fn load_absent_file_returns_default() {
    let tmp = TempDir::new().unwrap();
    std::fs::create_dir_all(tmp.path().join(".spec-board")).unwrap();

    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    assert_eq!(registry, MilestoneRegistry::default());
    assert!(registry.definitions().is_empty());
}

#[test]
fn load_empty_variants_normalize_to_default() {
    let cases = [
        ("", "完全に空"),
        ("   \n  \n", "空白のみ"),
        ("# just a comment\n", "コメントのみ"),
        ("---\n", "null ドキュメント"),
        ("milestones:\n", "milestones キーのみ（値なし）"),
        ("milestones: null\n", "milestones: null"),
        ("milestones: []\n", "空配列"),
    ];
    for (content, desc) in cases {
        let tmp = TempDir::new().unwrap();
        write_milestones_yml(tmp.path(), content);
        let registry = milestone_registry_store(tmp.path())
            .load()
            .unwrap_or_else(|e| panic!("{desc}: load 失敗 {e}"));
        assert!(registry.definitions().is_empty(), "{desc}: 空 Vec を期待");
    }
}

// ───────── lenient: 空文字正規化 ─────────

#[test]
fn load_empty_string_optional_fields_become_none() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(
        tmp.path(),
        "milestones:\n  - name: v0.3\n    title: \"\"\n    description: \"\"\n    due: \"\"\n    state: \"\"\n    updated: \"\"\n",
    );
    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    let m = &registry.definitions()[0];
    assert!(m.title.is_none(), "title 空文字 → None");
    assert!(m.description.is_none(), "description 空文字 → None");
    assert!(m.due.is_none(), "due 空文字 → None");
    assert!(m.state.is_none(), "state 空文字 → None");
    assert!(m.updated.is_none(), "updated 空文字 → None");
}

// ───────── lenient: order（型 lenient） ─────────

#[test]
fn load_order_zero_is_valid() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(tmp.path(), "milestones:\n  - name: v0.3\n    order: 0\n");
    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    assert_eq!(registry.definitions()[0].order, Some(0));
}

#[test]
fn load_invalid_order_values_fall_back_to_none() {
    let cases = [
        ("milestones:\n  - name: v0.3\n    order: \"x\"\n", "文字列"),
        ("milestones:\n  - name: v0.3\n    order: 1.5\n", "小数"),
        ("milestones:\n  - name: v0.3\n    order: -1\n", "負数"),
        ("milestones:\n  - name: v0.3\n    order: null\n", "null"),
        (
            "milestones:\n  - name: v0.3\n    order: 4294967296\n",
            "u32 範囲外",
        ),
    ];
    for (content, desc) in cases {
        let tmp = TempDir::new().unwrap();
        write_milestones_yml(tmp.path(), content);
        let registry = milestone_registry_store(tmp.path())
            .load()
            .unwrap_or_else(|e| panic!("{desc}: order は lenient であるべき -> {e}"));
        assert!(
            registry.definitions()[0].order.is_none(),
            "{desc}: order は None"
        );
    }
}

// ───────── lenient: state（値 lenient・型 strict） ─────────

#[test]
fn load_unknown_state_value_is_preserved_as_other() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(
        tmp.path(),
        "milestones:\n  - name: v0.3\n    state: frozen\n",
    );
    let registry = milestone_registry_store(tmp.path())
        .load()
        .expect("load ok");
    assert_eq!(
        registry.definitions()[0].state,
        MilestoneState::from_lenient("frozen")
    );
}

#[test]
fn load_non_string_state_is_parse_error() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(tmp.path(), "milestones:\n  - name: v0.3\n    state: 5\n");
    let err = milestone_registry_store(tmp.path()).load().unwrap_err();
    assert!(
        matches!(err, LoadMilestonesError::Parse { .. }),
        "got {err:?}"
    );
}

// ───────── load: parse / validation エラー ─────────

#[test]
fn load_non_string_name_is_parse_error() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(tmp.path(), "milestones:\n  - name: 123\n");
    let err = milestone_registry_store(tmp.path()).load().unwrap_err();
    assert!(
        matches!(err, LoadMilestonesError::Parse { .. }),
        "got {err:?}"
    );
}

#[test]
fn load_top_level_milestones_non_sequence_is_parse_error() {
    let cases = ["milestones: \"x\"\n", "milestones:\n  key: value\n"];
    for content in cases {
        let tmp = TempDir::new().unwrap();
        write_milestones_yml(tmp.path(), content);
        let err = milestone_registry_store(tmp.path()).load().unwrap_err();
        assert!(
            matches!(err, LoadMilestonesError::Parse { .. }),
            "配列以外は Parse: {content:?} -> {err:?}"
        );
    }
}

#[test]
fn load_item_non_mapping_is_parse_error() {
    let cases = ["milestones:\n  - \"v0.3\"\n", "milestones:\n  - null\n"];
    for content in cases {
        let tmp = TempDir::new().unwrap();
        write_milestones_yml(tmp.path(), content);
        let err = milestone_registry_store(tmp.path()).load().unwrap_err();
        assert!(
            matches!(err, LoadMilestonesError::Parse { .. }),
            "要素 mapping 以外は Parse: {content:?} -> {err:?}"
        );
    }
}

#[test]
fn load_duplicate_name_is_validation_error() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(tmp.path(), "milestones:\n  - name: v0.3\n  - name: v0.3\n");
    let err = milestone_registry_store(tmp.path()).load().unwrap_err();
    assert!(
        matches!(
            err,
            LoadMilestonesError::Validation(
                MilestoneValidationError::DuplicateMilestoneName { .. }
            )
        ),
        "got {err:?}"
    );
}

#[test]
fn load_empty_name_is_validation_error() {
    let tmp = TempDir::new().unwrap();
    write_milestones_yml(tmp.path(), "milestones:\n  - name: \"\"\n");
    let err = milestone_registry_store(tmp.path()).load().unwrap_err();
    assert!(
        matches!(
            err,
            LoadMilestonesError::Validation(MilestoneValidationError::EmptyMilestoneName)
        ),
        "got {err:?}"
    );
}

// ───────── aggregate: plan_create ─────────

#[test]
fn plan_create_sets_updated_and_pushes() {
    let registry = MilestoneRegistry::default();
    let clock = FixedClock::new(FIXED_NOW);
    let next = registry
        .plan_create_milestone(definition("v0.3"), &clock)
        .expect("create ok");
    assert_eq!(next.definitions().len(), 1);
    assert_eq!(next.definitions()[0].name, "v0.3");
    assert_eq!(next.definitions()[0].updated.as_deref(), Some(FIXED_NOW));
    // 元の registry は不変（副作用なし）
    assert!(registry.definitions().is_empty());
}

#[test]
fn plan_create_rejects_duplicate() {
    let registry = MilestoneRegistry::try_new(vec![definition("v0.3")]).expect("valid registry");
    let clock = FixedClock::new(FIXED_NOW);
    let err = registry
        .plan_create_milestone(definition("v0.3"), &clock)
        .unwrap_err();
    assert!(matches!(
        err,
        MilestoneValidationError::DuplicateMilestoneName { .. }
    ));
}

// ───────── aggregate: plan_update（PUT） ─────────

#[test]
fn plan_update_replaces_metadata_and_keeps_name() {
    let mut existing = definition("v0.3");
    existing.title = Some("旧タイトル".to_string());
    existing.due = Some("2026-07-31".to_string());
    let registry = MilestoneRegistry::try_new(vec![existing]).expect("valid registry");
    let clock = FixedClock::new(FIXED_NOW);
    let intent = UpdateMilestoneIntent {
        name: "v0.3".to_string(),
        title: Some("新タイトル".to_string()),
        description: None,
        due: None, // PUT: 未指定はクリア
        order: Some(1),
        state: Some(MilestoneState::Closed),
    };
    let next = registry
        .plan_update_milestone(intent, &clock)
        .expect("update ok");
    let m = &next.definitions()[0];
    assert_eq!(m.name, "v0.3", "name は維持");
    assert_eq!(m.title.as_deref(), Some("新タイトル"));
    assert!(m.due.is_none(), "未指定 due はクリアされる（PUT）");
    assert_eq!(m.order, Some(1));
    assert_eq!(m.state, Some(MilestoneState::Closed));
    assert_eq!(m.updated.as_deref(), Some(FIXED_NOW));
}

#[test]
fn plan_update_not_found_returns_error() {
    let registry = MilestoneRegistry::try_new(vec![definition("v0.3")]).expect("valid registry");
    let clock = FixedClock::new(FIXED_NOW);
    let intent = UpdateMilestoneIntent {
        name: "v9.9".to_string(),
        title: None,
        description: None,
        due: None,
        order: None,
        state: None,
    };
    let err = registry.plan_update_milestone(intent, &clock).unwrap_err();
    assert!(matches!(err, UpdateMilestonePlanError::NotFound { .. }));
}

#[test]
fn plan_update_empty_name_returns_error() {
    let registry = MilestoneRegistry::default();
    let clock = FixedClock::new(FIXED_NOW);
    let intent = UpdateMilestoneIntent {
        name: String::new(),
        title: None,
        description: None,
        due: None,
        order: None,
        state: None,
    };
    let err = registry.plan_update_milestone(intent, &clock).unwrap_err();
    assert!(matches!(err, UpdateMilestonePlanError::EmptyName));
}

// ───────── aggregate: plan_delete ─────────

#[test]
fn plan_delete_removes_target_keeps_others() {
    let registry = MilestoneRegistry::try_new(vec![definition("v0.3"), definition("v0.4")])
        .expect("valid registry");
    let next = registry.plan_delete_milestone("v0.3").expect("delete ok");
    let names: Vec<&str> = next.definitions().iter().map(|m| m.name.as_str()).collect();
    assert_eq!(names, vec!["v0.4"]);
}

#[test]
fn plan_delete_not_found_returns_error() {
    let registry = MilestoneRegistry::try_new(vec![definition("v0.3")]).expect("valid registry");
    let err = registry.plan_delete_milestone("v9.9").unwrap_err();
    assert!(matches!(err, DeleteMilestonePlanError::NotFound { .. }));
}

// ───────── save ─────────

#[test]
fn save_then_load_roundtrips_registry() {
    let tmp = TempDir::new().unwrap();
    let registry = MilestoneRegistry::try_new(vec![
        MilestoneDefinition {
            name: "v0.3".to_string(),
            title: Some("v0.3 リリース".to_string()),
            description: Some("基盤整備".to_string()),
            due: Some("2026-07-31".to_string()),
            order: Some(0),
            state: Some(MilestoneState::Open),
            updated: Some("2026-06-03T12:00:00Z".to_string()),
        },
        definition("v0.4"),
    ])
    .expect("valid registry");

    let store = milestone_registry_store(tmp.path());
    store.save(&registry).expect("save ok");
    let loaded = store.load().expect("load ok");
    assert_eq!(loaded, registry);
}

#[test]
fn serialize_keeps_milestones_wire_shape() {
    let registry = MilestoneRegistry::try_new(vec![definition("v0.3")]).expect("valid registry");

    let value = serde_json::to_value(registry).expect("serialize registry");
    assert_eq!(
        value,
        serde_json::json!({ "milestones": [{ "name": "v0.3" }] })
    );
}

#[test]
fn save_preserves_unknown_state_value() {
    let tmp = TempDir::new().unwrap();
    let mut m = definition("v0.3");
    m.state = MilestoneState::from_lenient("frozen");
    let registry = MilestoneRegistry::try_new(vec![m]).expect("valid registry");
    let store = milestone_registry_store(tmp.path());
    store.save(&registry).expect("save ok");
    let loaded = store.load().expect("load ok");
    assert_eq!(loaded, registry);
}

// ───────── MilestoneState ─────────

#[test]
fn milestone_state_from_lenient_treats_exact_empty_as_unspecified() {
    assert_eq!(MilestoneState::from_lenient(""), None);
}

#[test]
fn milestone_state_from_lenient_maps_exact_lowercase_reserved_words() {
    assert_eq!(
        MilestoneState::from_lenient("open"),
        Some(MilestoneState::Open)
    );
    assert_eq!(
        MilestoneState::from_lenient("closed"),
        Some(MilestoneState::Closed)
    );
}

#[test]
fn milestone_state_from_lenient_preserves_other_raw_values() {
    for raw in ["frozen", "Open", " open", "closed ", "   "] {
        let state = MilestoneState::from_lenient(raw).expect("non-empty state");
        assert!(matches!(state, MilestoneState::Other(_)), "raw: {raw:?}");
        assert_eq!(state.as_str(), raw);
    }
}

// ───────── format 抽象（trait モック） ─────────

struct MockStore {
    registry: MilestoneRegistry,
}

impl MilestoneRegistryStore for MockStore {
    fn load(&self) -> Result<MilestoneRegistry, LoadMilestonesError> {
        Ok(self.registry.clone())
    }
    fn save(&self, _registry: &MilestoneRegistry) -> Result<(), SaveMilestonesError> {
        Ok(())
    }
}

#[test]
fn store_can_be_mocked_via_trait_object() {
    let registry = MilestoneRegistry::try_new(vec![definition("mocked")]).expect("valid registry");
    let store = MockStore {
        registry: registry.clone(),
    };
    let dyn_store: &dyn MilestoneRegistryStore = &store;
    assert_eq!(dyn_store.load().expect("load ok"), registry);
}
