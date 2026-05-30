//! `LabelRegistry` / `LabelColor` / `LabelRegistryStore`（`YamlLabelRegistryStore`）の
//! ユニットテスト。load / save / color lenient / validate / format 抽象（trait モック）を網羅する。

use super::{
    label_registry_store, LabelColor, LabelDefinition, LabelRegistry, LabelRegistryStore,
    LabelValidationError, LoadLabelsError, SaveLabelsError,
};
use tempfile::TempDir;

fn write_labels_yml(root: &std::path::Path, content: &str) {
    let dir = root.join(".spec-board");
    std::fs::create_dir_all(&dir).expect("create .spec-board");
    std::fs::write(dir.join("labels.yml"), content).expect("write labels.yml");
}

// ───────── load: 正常系 ─────────

#[test]
fn load_parses_definitions_with_all_fields() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(
        tmp.path(),
        "labels:\n  - name: bug\n    description: バグ報告\n    group: type\n    color: \"#D73A4A\"\n    updated: \"2026-05-30T12:00:00Z\"\n",
    );

    let store = label_registry_store(tmp.path());
    let registry = store.load().expect("load ok");

    assert_eq!(registry.labels.len(), 1);
    let label = &registry.labels[0];
    assert_eq!(label.name, "bug");
    assert_eq!(label.description.as_deref(), Some("バグ報告"));
    assert_eq!(label.group.as_deref(), Some("type"));
    assert_eq!(
        label.color.as_ref().map(LabelColor::as_str),
        Some("#D73A4A")
    );
    assert_eq!(label.updated.as_deref(), Some("2026-05-30T12:00:00Z"));
}

#[test]
fn load_name_only_label_leaves_optional_fields_none() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(tmp.path(), "labels:\n  - name: enhancement\n");

    let registry = label_registry_store(tmp.path()).load().expect("load ok");
    assert_eq!(registry.labels.len(), 1);
    let label = &registry.labels[0];
    assert_eq!(label.name, "enhancement");
    assert!(label.description.is_none());
    assert!(label.group.is_none());
    assert!(label.color.is_none());
    assert!(label.updated.is_none());
}

#[test]
fn load_preserves_definition_order() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(
        tmp.path(),
        "labels:\n  - name: zebra\n  - name: apple\n  - name: mango\n",
    );

    let registry = label_registry_store(tmp.path()).load().expect("load ok");
    let names: Vec<&str> = registry.labels.iter().map(|l| l.name.as_str()).collect();
    assert_eq!(names, vec!["zebra", "apple", "mango"]);
}

#[test]
fn load_ignores_unknown_keys() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(
        tmp.path(),
        "version: 2\nlabels:\n  - name: bug\n    futureField: ignored\n",
    );

    let registry = label_registry_store(tmp.path()).load().expect("load ok");
    assert_eq!(registry.labels.len(), 1);
    assert_eq!(registry.labels[0].name, "bug");
}

// ───────── load: 空相当 → Default ─────────

#[test]
fn load_absent_file_returns_default() {
    let tmp = TempDir::new().unwrap();
    std::fs::create_dir_all(tmp.path().join(".spec-board")).unwrap();

    let registry = label_registry_store(tmp.path()).load().expect("load ok");
    assert_eq!(registry, LabelRegistry::default());
    assert!(registry.labels.is_empty());
}

#[test]
fn load_empty_variants_normalize_to_default() {
    let cases = [
        ("", "完全に空"),
        ("   \n  \n", "空白のみ"),
        ("# just a comment\n", "コメントのみ"),
        ("---\n", "null ドキュメント"),
        ("labels:\n", "labels キーのみ（値なし）"),
        ("labels: null\n", "labels: null"),
        ("labels: []\n", "空配列"),
    ];
    for (content, desc) in cases {
        let tmp = TempDir::new().unwrap();
        write_labels_yml(tmp.path(), content);
        let registry = label_registry_store(tmp.path())
            .load()
            .unwrap_or_else(|e| panic!("{desc}: load 失敗 {e}"));
        assert!(registry.labels.is_empty(), "{desc}: 空 Vec を期待");
    }
}

// ───────── color: lenient ─────────

#[test]
fn load_valid_quoted_color_is_some() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(
        tmp.path(),
        "labels:\n  - name: bug\n    color: \"#1A2B3C\"\n",
    );
    let registry = label_registry_store(tmp.path()).load().expect("load ok");
    assert_eq!(
        registry.labels[0].color.as_ref().map(LabelColor::as_str),
        Some("#1A2B3C")
    );
}

#[test]
fn load_unquoted_color_is_treated_as_yaml_comment_and_becomes_none() {
    let tmp = TempDir::new().unwrap();
    // `color: #1A2B3C` は `#` 以降コメント扱い → 値 null → None
    write_labels_yml(tmp.path(), "labels:\n  - name: bug\n    color: #1A2B3C\n");
    let registry = label_registry_store(tmp.path()).load().expect("load ok");
    assert!(registry.labels[0].color.is_none());
}

#[test]
fn load_invalid_color_values_fall_back_to_none() {
    let cases = [
        "labels:\n  - name: a\n    color: \"red\"\n",
        "labels:\n  - name: a\n    color: \"#GGGGGG\"\n",
        "labels:\n  - name: a\n    color: \"#123\"\n",
        "labels:\n  - name: a\n    color: 123\n",
        "labels:\n  - name: a\n    color: {}\n",
        "labels:\n  - name: a\n    color: null\n",
    ];
    for content in cases {
        let tmp = TempDir::new().unwrap();
        write_labels_yml(tmp.path(), content);
        let registry = label_registry_store(tmp.path())
            .load()
            .unwrap_or_else(|e| panic!("color lenient であるべき: {content:?} -> {e}"));
        assert!(
            registry.labels[0].color.is_none(),
            "不正 color は None: {content:?}"
        );
    }
}

#[test]
fn label_color_from_hex_accepts_only_rrggbb() {
    assert!(LabelColor::from_hex("#000000").is_some());
    assert!(LabelColor::from_hex("#abcdef").is_some());
    assert!(LabelColor::from_hex("#ABCDEF").is_some());
    assert!(LabelColor::from_hex("000000").is_none());
    assert!(LabelColor::from_hex("#12345").is_none());
    assert!(LabelColor::from_hex("#1234567").is_none());
    assert!(LabelColor::from_hex("#GGGGGG").is_none());
    assert!(LabelColor::from_hex("").is_none());
}

// ───────── load: parse / validation エラー ─────────

#[test]
fn load_broken_yaml_returns_parse_error() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(tmp.path(), "labels:\n  - name: bug\n  invalid: : :\n");
    let err = label_registry_store(tmp.path()).load().unwrap_err();
    assert!(matches!(err, LoadLabelsError::Parse { .. }), "got {err:?}");
}

#[test]
fn load_non_string_field_type_mismatch_is_parse_error() {
    // color 以外（name / description / group / updated）の型不一致は Parse（lenient は color のみ）。
    // 数値・bool・mapping いずれの非文字列も拒否する。
    let cases = [
        "labels:\n  - name: 123\n",
        "labels:\n  - name: bug\n    description: 123\n",
        "labels:\n  - name: bug\n    group: true\n",
        "labels:\n  - name: bug\n    updated: 2026\n",
        "labels:\n  - name: bug\n    description:\n      nested: true\n",
    ];
    for content in cases {
        let tmp = TempDir::new().unwrap();
        write_labels_yml(tmp.path(), content);
        let err = label_registry_store(tmp.path()).load().unwrap_err();
        assert!(
            matches!(err, LoadLabelsError::Parse { .. }),
            "型不一致は Parse: {content:?} -> {err:?}"
        );
    }
}

#[test]
fn load_duplicate_name_is_validation_error() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(tmp.path(), "labels:\n  - name: bug\n  - name: bug\n");
    let err = label_registry_store(tmp.path()).load().unwrap_err();
    assert!(
        matches!(
            err,
            LoadLabelsError::Validation(LabelValidationError::DuplicateLabelName { .. })
        ),
        "got {err:?}"
    );
}

#[test]
fn load_empty_name_is_validation_error() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(tmp.path(), "labels:\n  - name: \"\"\n");
    let err = label_registry_store(tmp.path()).load().unwrap_err();
    assert!(
        matches!(
            err,
            LoadLabelsError::Validation(LabelValidationError::EmptyLabelName)
        ),
        "got {err:?}"
    );
}

#[test]
fn load_whitespace_only_name_is_allowed() {
    let tmp = TempDir::new().unwrap();
    write_labels_yml(tmp.path(), "labels:\n  - name: \"   \"\n");
    let registry = label_registry_store(tmp.path())
        .load()
        .expect("空白のみ name は許容（未正規化）");
    assert_eq!(registry.labels[0].name, "   ");
}

// ───────── save ─────────

#[test]
fn save_then_load_roundtrips_registry() {
    let tmp = TempDir::new().unwrap();
    let registry = LabelRegistry {
        labels: vec![
            LabelDefinition {
                name: "bug".to_string(),
                description: Some("バグ".to_string()),
                group: Some("type".to_string()),
                color: LabelColor::from_hex("#D73A4A"),
                updated: Some("2026-05-30T00:00:00Z".to_string()),
            },
            LabelDefinition {
                name: "enhancement".to_string(),
                description: None,
                group: None,
                color: None,
                updated: None,
            },
        ],
    };

    let store = label_registry_store(tmp.path());
    store.save(&registry).expect("save ok");
    let loaded = store.load().expect("load ok");
    assert_eq!(loaded, registry);
}

#[test]
fn save_rejects_inconsistent_registry() {
    let tmp = TempDir::new().unwrap();
    let registry = LabelRegistry {
        labels: vec![
            LabelDefinition {
                name: "dup".to_string(),
                description: None,
                group: None,
                color: None,
                updated: None,
            },
            LabelDefinition {
                name: "dup".to_string(),
                description: None,
                group: None,
                color: None,
                updated: None,
            },
        ],
    };
    let err = label_registry_store(tmp.path())
        .save(&registry)
        .unwrap_err();
    assert!(
        matches!(
            err,
            SaveLabelsError::Validation(LabelValidationError::DuplicateLabelName { .. })
        ),
        "got {err:?}"
    );
    // 検証で弾くため labels.yml は書き出されない
    assert!(!tmp.path().join(".spec-board/labels.yml").exists());
}

// ───────── format 抽象（trait モック） ─────────

/// 任意の `LabelRegistry` を返すモック store。YAML を介さず DI できることの検証用。
struct MockStore {
    registry: LabelRegistry,
}

impl LabelRegistryStore for MockStore {
    fn load(&self) -> Result<LabelRegistry, LoadLabelsError> {
        Ok(self.registry.clone())
    }
    fn save(&self, _registry: &LabelRegistry) -> Result<(), SaveLabelsError> {
        Ok(())
    }
}

#[test]
fn store_can_be_mocked_via_trait_object() {
    let registry = LabelRegistry {
        labels: vec![LabelDefinition {
            name: "mocked".to_string(),
            description: None,
            group: None,
            color: None,
            updated: None,
        }],
    };
    let store = MockStore {
        registry: registry.clone(),
    };
    // &dyn LabelRegistryStore として trait 越しに使える（具象型を名指ししない）
    let dyn_store: &dyn LabelRegistryStore = &store;
    assert_eq!(dyn_store.load().expect("load ok"), registry);
}
