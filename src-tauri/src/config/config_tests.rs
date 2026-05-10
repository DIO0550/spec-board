use super::*;

// ───────── Default ─────────

#[test]
fn default_returns_spec_baseline_columns_and_done_column() {
    let c = Config::default();
    assert_eq!(c.version, 1);
    assert_eq!(
        c.columns,
        vec![
            Column {
                name: "Todo".into(),
                order: 0,
            },
            Column {
                name: "In Progress".into(),
                order: 1,
            },
            Column {
                name: "Done".into(),
                order: 2,
            },
        ]
    );
    assert!(c.card_order.is_empty());
    assert_eq!(c.done_column.as_deref(), Some("Done"));
}

// ───────── Round-trip ─────────

#[test]
fn roundtrip_spec_example_json() {
    let json_in = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo", "order": 0 },
            { "name": "In Progress", "order": 1 },
            { "name": "Done", "order": 2 }
        ],
        "cardOrder": {
            "Todo": ["tasks/task-a.md", "tasks/task-b.md"],
            "In Progress": ["tasks/task-c.md"],
            "Done": []
        },
        "doneColumn": "Done"
    }"#;

    let parsed: Config = serde_json::from_str(json_in).unwrap();
    let value = serde_json::to_value(&parsed).unwrap();
    let reparsed: Config = serde_json::from_value(value).unwrap();
    assert_eq!(parsed, reparsed);

    assert_eq!(parsed.version, 1);
    assert_eq!(parsed.columns.len(), 3);
    assert_eq!(
        parsed.columns[0],
        Column {
            name: "Todo".into(),
            order: 0
        }
    );
    assert_eq!(parsed.card_order.get("Todo").unwrap().len(), 2);
    assert_eq!(parsed.done_column.as_deref(), Some("Done"));
}

#[test]
fn column_roundtrip() {
    let cases: Vec<(&str, Column)> = vec![
        (
            r#"{"name":"Todo","order":0}"#,
            Column {
                name: "Todo".into(),
                order: 0,
            },
        ),
        (
            r#"{"name":"In Progress","order":1}"#,
            Column {
                name: "In Progress".into(),
                order: 1,
            },
        ),
    ];
    for (json_in, expected) in cases {
        let parsed: Column = serde_json::from_str(json_in).unwrap();
        assert_eq!(parsed, expected);
        let reparsed: Column =
            serde_json::from_value(serde_json::to_value(&parsed).unwrap()).unwrap();
        assert_eq!(parsed, reparsed);
    }
}

// ───────── Optional 省略 ─────────

#[test]
fn parses_with_done_column_absent() {
    let json_in = r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#;
    let parsed: Config = serde_json::from_str(json_in).unwrap();
    assert_eq!(parsed.done_column, None);
}

#[test]
fn parses_with_done_column_null() {
    let json_in = r#"{
        "version": 1,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {},
        "doneColumn": null
    }"#;
    let parsed: Config = serde_json::from_str(json_in).unwrap();
    assert_eq!(parsed.done_column, None);
}

#[test]
fn serialize_omits_done_column_when_none() {
    let c = Config {
        done_column: None,
        ..Config::default()
    };
    let v = serde_json::to_value(&c).unwrap();
    let obj = v.as_object().unwrap();
    assert!(
        !obj.contains_key("doneColumn"),
        "doneColumn key must be omitted when None"
    );
    assert!(
        !obj.contains_key("done_column"),
        "snake_case must not be emitted"
    );
}

// ───────── camelCase キー名 ─────────

#[test]
fn field_names_are_camel_case_in_json() {
    let c = Config {
        version: 1,
        columns: vec![Column {
            name: "Todo".into(),
            order: 0,
        }],
        card_order: BTreeMap::from([("Todo".to_string(), vec!["tasks/a.md".to_string()])]),
        done_column: Some("Todo".into()),
    };
    let v = serde_json::to_value(&c).unwrap();
    let obj = v.as_object().unwrap();
    assert!(obj.contains_key("version"));
    assert!(obj.contains_key("columns"));
    assert!(obj.contains_key("cardOrder"));
    assert!(obj.contains_key("doneColumn"));
    assert!(!obj.contains_key("card_order"));
    assert!(!obj.contains_key("done_column"));
}

// ───────── 決定論的キー順 (BTreeMap) ─────────

#[test]
fn card_order_keys_are_serialized_in_sorted_order() {
    let mut card_order = CardOrder::new();
    card_order.insert("Done".into(), vec![]);
    card_order.insert("Todo".into(), vec!["tasks/a.md".into()]);
    card_order.insert("In Progress".into(), vec!["tasks/b.md".into()]);
    let c = Config {
        version: 1,
        columns: vec![],
        card_order,
        done_column: None,
    };

    let json = serde_json::to_string(&c).unwrap();
    let done_pos = json.find("\"Done\"").unwrap();
    let in_progress_pos = json.find("\"In Progress\"").unwrap();
    let todo_pos = json.find("\"Todo\"").unwrap();
    assert!(
        done_pos < in_progress_pos && in_progress_pos < todo_pos,
        "BTreeMap keys must be serialized in ascending order: got {json}"
    );
}

// ───────── 未知フィールドは ignore ─────────

#[test]
fn unknown_fields_are_ignored() {
    let json_in = r#"{
        "version": 1,
        "columns": [],
        "cardOrder": {},
        "futureFlag": "ignored"
    }"#;
    let parsed: Config = serde_json::from_str(json_in).unwrap();
    assert_eq!(parsed.version, 1);
    assert!(parsed.columns.is_empty());
    assert!(parsed.card_order.is_empty());
    assert_eq!(parsed.done_column, None);
}

// ───────── 必須フィールド欠落 → parse エラー ─────────

#[test]
fn empty_object_fails_to_parse() {
    let err = serde_json::from_str::<Config>("{}").unwrap_err();
    let msg = err.to_string();
    assert!(
        msg.contains("version"),
        "expected error to mention required field: {msg}"
    );
}

#[test]
fn missing_columns_fails_to_parse() {
    let json_in = r#"{ "version": 1, "cardOrder": {} }"#;
    let err = serde_json::from_str::<Config>(json_in).unwrap_err();
    assert!(
        err.to_string().contains("columns"),
        "expected error to mention `columns`: {err}"
    );
}

#[test]
fn missing_card_order_fails_to_parse() {
    let json_in = r#"{ "version": 1, "columns": [{ "name": "Todo", "order": 0 }] }"#;
    let err = serde_json::from_str::<Config>(json_in).unwrap_err();
    assert!(
        err.to_string().contains("cardOrder"),
        "expected error to mention `cardOrder`: {err}"
    );
}

// ───────── Config::resolved_done_column ─────────

#[test]
fn resolved_done_column_parametrized() {
    fn col(name: &str, order: u32) -> Column {
        Column {
            name: name.into(),
            order,
        }
    }

    struct Case {
        label: &'static str,
        done_column: Option<&'static str>,
        columns: Vec<Column>,
        expected: Option<&'static str>,
    }

    let cases: Vec<Case> = vec![
        Case {
            label: "Some(Done) returns Some(Done)",
            done_column: Some("Done"),
            columns: vec![col("Todo", 0), col("In Progress", 1), col("Done", 2)],
            expected: Some("Done"),
        },
        Case {
            label: "None + 空 columns → None",
            done_column: None,
            columns: vec![],
            expected: None,
        },
        Case {
            label: "None + 単一 columns → そのカラム名",
            done_column: None,
            columns: vec![col("Todo", 0)],
            expected: Some("Todo"),
        },
        Case {
            label: "None + 3 カラム → order 最大の Done",
            done_column: None,
            columns: vec![col("Todo", 0), col("In Progress", 1), col("Done", 2)],
            expected: Some("Done"),
        },
        Case {
            label: "Some(Custom) は columns に無くても素通し",
            done_column: Some("Custom"),
            columns: vec![col("Todo", 0), col("Done", 1)],
            expected: Some("Custom"),
        },
        Case {
            label: "配列順が order 昇順でなくても order 最大が返る",
            done_column: None,
            columns: vec![col("Done", 2), col("Todo", 0), col("In Progress", 1)],
            expected: Some("Done"),
        },
        Case {
            label: "同一 order の場合は最後に現れた要素",
            done_column: None,
            columns: vec![col("A", 1), col("B", 1)],
            expected: Some("B"),
        },
    ];

    for case in cases {
        let cfg = Config {
            version: 1,
            columns: case.columns,
            card_order: BTreeMap::new(),
            done_column: case.done_column.map(|s| s.to_string()),
        };
        assert_eq!(
            cfg.resolved_done_column(),
            case.expected,
            "case: {}",
            case.label
        );
    }
}

// ───────── generate_guide_markdown ─────────

#[test]
fn generate_guide_markdown_from_default_config_returns_spec_baseline() {
    let guide = Config::default().guide_markdown();

    assert!(guide.starts_with("# spec-board タスクフォーマットガイド\n\n"));
    assert!(guide.contains("## テンプレート\n\n"));
    assert!(guide.contains("status: Todo（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）"));
    assert!(guide.contains("## 有効なステータス値\n\n- Todo\n- In Progress\n- Done\n\n"));
    assert!(guide.contains("## ルール\n\n"));
    assert!(guide.ends_with('\n'));
}

#[test]
fn generate_guide_markdown_uses_columns_order_for_valid_status_values() {
    let columns = vec![col("Done", 2), col("Todo", 0), col("In Progress", 1)];

    let guide = generate_guide_markdown_for_columns(&columns);

    let todo_pos = guide.find("- Todo").unwrap();
    let in_progress_pos = guide.find("- In Progress").unwrap();
    let done_pos = guide.find("- Done").unwrap();
    assert!(todo_pos < in_progress_pos);
    assert!(in_progress_pos < done_pos);
}

#[test]
fn generate_guide_markdown_uses_first_column_by_order_as_status_example() {
    let columns = vec![col("Review", 20), col("Backlog", 10)];

    let guide = generate_guide_markdown_for_columns(&columns);

    assert!(guide.contains("status: Backlog（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）"));
}

#[test]
fn generate_guide_markdown_reflects_column_add_rename_and_delete_inputs() {
    let guide = generate_guide_markdown_for_columns(&[
        col("Backlog", 0),
        col("Review", 1),
        col("Released", 2),
    ]);

    assert!(guide.contains("## 有効なステータス値\n\n- Backlog\n- Review\n- Released\n\n"));
    assert!(!guide.contains("- Todo\n"));
    assert!(!guide.contains("- Done\n"));
}

#[test]
fn generate_guide_markdown_handles_empty_columns_without_status_bullets() {
    let guide = generate_guide_markdown_for_columns(&[]);

    assert!(guide.contains("status: Todo（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）"));
    assert!(guide.contains("## 有効なステータス値\n\n## ルール\n\n"));
}

#[test]
fn generate_guide_markdown_outputs_column_names_raw() {
    let columns = vec![col("* Raw:Name", 0), col("  Spaced  ", 1), col("", 2)];

    let guide = generate_guide_markdown_for_columns(&columns);

    assert!(guide.contains("status: * Raw:Name（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）"));
    assert!(guide.contains("- * Raw:Name\n"));
    assert!(guide.contains("-   Spaced  \n"));
    assert!(guide.contains("- \n"));
}

#[test]
fn generate_guide_markdown_preserves_input_order_for_equal_column_order() {
    let columns = vec![col("First", 1), col("Second", 1), col("Third", 2)];

    let guide = generate_guide_markdown_for_columns(&columns);

    let first_pos = guide.find("- First").unwrap();
    let second_pos = guide.find("- Second").unwrap();
    let third_pos = guide.find("- Third").unwrap();
    assert!(first_pos < second_pos);
    assert!(second_pos < third_pos);
}

#[test]
fn generate_guide_markdown_has_stable_section_order_and_trailing_newline() {
    let guide = generate_guide_markdown_for_columns(&[col("Todo", 0)]);

    let title_pos = guide.find("# spec-board タスクフォーマットガイド").unwrap();
    let template_pos = guide.find("## テンプレート").unwrap();
    let statuses_pos = guide.find("## 有効なステータス値").unwrap();
    let rules_pos = guide.find("## ルール").unwrap();
    assert!(title_pos < template_pos);
    assert!(template_pos < statuses_pos);
    assert!(statuses_pos < rules_pos);
    assert!(guide.ends_with("- `parent` に指定するパスはプロジェクトルートからの相対パスです\n"));
}

// ───────── write_guide_markdown_best_effort ─────────

#[test]
fn write_guide_markdown_best_effort_writes_config_guide_markdown() {
    let tmp = TempDir::new().unwrap();
    let config = Config {
        version: 1,
        columns: vec![col("Review", 1), col("Backlog", 0)],
        card_order: BTreeMap::new(),
        done_column: Some("Review".into()),
    };

    write_guide_markdown_best_effort(tmp.path(), &config);

    let guide_path = tmp.path().join(".spec-board").join("GUIDE.md");
    let written = std::fs::read_to_string(guide_path).unwrap();
    assert_eq!(written, config.guide_markdown());
    assert!(written.contains("status: Backlog（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）"));
}

#[test]
fn write_guide_markdown_best_effort_overwrites_existing_guide() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let guide_path = dir.join("GUIDE.md");
    std::fs::write(&guide_path, "old").unwrap();
    let config = Config {
        version: 1,
        columns: vec![],
        card_order: BTreeMap::new(),
        done_column: None,
    };

    write_guide_markdown_best_effort(tmp.path(), &config);

    assert_eq!(
        std::fs::read_to_string(guide_path).unwrap(),
        config.guide_markdown()
    );
}

#[test]
fn write_guide_markdown_best_effort_does_not_panic_when_project_root_missing() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("does-not-exist");

    write_guide_markdown_best_effort(&missing, &Config::default());
}

#[test]
fn write_guide_markdown_best_effort_does_not_panic_when_project_root_is_file() {
    let tmp = TempDir::new().unwrap();
    let file_root = tmp.path().join("project.md");
    std::fs::write(&file_root, "not a directory").unwrap();

    write_guide_markdown_best_effort(&file_root, &Config::default());
}

#[test]
fn write_guide_markdown_best_effort_does_not_panic_when_spec_board_is_file() {
    let tmp = TempDir::new().unwrap();
    std::fs::write(tmp.path().join(".spec-board"), "not a directory").unwrap();

    write_guide_markdown_best_effort(tmp.path(), &Config::default());
}

#[cfg(unix)]
#[test]
fn write_guide_markdown_best_effort_does_not_panic_when_guide_is_unwritable() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let guide_path = dir.join("GUIDE.md");
    std::fs::write(&guide_path, "old").unwrap();
    // tmp ファイル + rename で置き換える実装のため、書き込み失敗を再現するには
    // GUIDE.md ではなく親ディレクトリ .spec-board/ の書き込み権限を落とす必要がある。
    let original_dir_perms = std::fs::metadata(&dir).unwrap().permissions();
    let mut perms = original_dir_perms.clone();
    perms.set_mode(0o500);
    std::fs::set_permissions(&dir, perms).unwrap();

    // root / 権限昇格環境では chmod を無視して書き込めてしまうため、
    // 実際に書き込めない環境かを probe で判定し、その場合のみ内容変化を検証する。
    let probe = dir.join("__probe");
    let actually_unwritable = std::fs::write(&probe, b"x").is_err();
    let _ = std::fs::remove_file(&probe);

    write_guide_markdown_best_effort(tmp.path(), &Config::default());

    std::fs::set_permissions(&dir, original_dir_perms).unwrap();

    if actually_unwritable {
        let after = std::fs::read_to_string(&guide_path).unwrap();
        assert_eq!(after, "old");
    }
}

#[test]
fn format_guide_write_warning_includes_project_root_and_error_context() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("does-not-exist");
    let error =
        spec_board_fs::config::config_io::write_guide_markdown(&missing, "content").unwrap_err();

    let message = format_guide_write_warning(&missing, &error);

    assert!(message.contains("failed to write .spec-board/GUIDE.md"));
    assert!(message.contains(&missing.display().to_string()));
    assert!(message.contains("config_io: I/O error"));
}

// ───────── load_or_default ─────────

use tempfile::TempDir;

#[test]
fn load_or_default_creates_dir_and_returns_default_when_nothing_exists() {
    let tmp = TempDir::new().unwrap();
    let cfg = load_or_default(tmp.path()).unwrap();
    assert_eq!(cfg, Config::default());
    assert!(tmp.path().join(".spec-board").is_dir());
}

#[test]
fn load_or_default_returns_default_when_only_dir_exists() {
    let tmp = TempDir::new().unwrap();
    std::fs::create_dir(tmp.path().join(".spec-board")).unwrap();

    let cfg = load_or_default(tmp.path()).unwrap();
    assert_eq!(cfg, Config::default());
}

#[test]
fn load_or_default_parses_existing_config_json() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let content = r#"{
        "version": 1,
        "columns": [
            { "name": "Todo", "order": 0 },
            { "name": "Done", "order": 1 }
        ],
        "cardOrder": {
            "Todo": ["tasks/a.md"],
            "Done": []
        },
        "doneColumn": null
    }"#;
    std::fs::write(dir.join("config.json"), content).unwrap();

    let cfg = load_or_default(tmp.path()).unwrap();
    assert_eq!(cfg.version, 1);
    assert_eq!(cfg.columns.len(), 2);
    assert_eq!(cfg.done_column, None);
    // done_column が無くても resolved_done_column は末尾カラムを返す
    assert_eq!(cfg.resolved_done_column(), Some("Done"));
}

#[test]
fn load_or_default_returns_parse_err_for_invalid_json() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    std::fs::write(dir.join("config.json"), "{not valid json").unwrap();

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::Parse { path, .. } => {
            assert_eq!(path, dir.join("config.json"));
        }
        other => panic!("expected Parse error, got {other:?}"),
    }
}

#[test]
fn load_or_default_returns_io_err_when_project_root_missing() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("does-not-exist");

    let err = load_or_default(&missing).unwrap_err();
    match err {
        LoadConfigError::Io(_) => {}
        other => panic!("expected Io error, got {other:?}"),
    }
}

// ───────── build_config_from_statuses ─────────

fn col(name: &str, order: u32) -> Column {
    Column {
        name: name.into(),
        order,
    }
}

fn pb(s: &str) -> PathBuf {
    PathBuf::from(s)
}

#[test]
fn build_config_from_statuses_parametrized() {
    struct Case {
        label: &'static str,
        inputs: Vec<(PathBuf, Option<String>)>,
        expected_columns: Vec<Column>,
        expected_done: Option<&'static str>,
    }

    let cases: Vec<Case> = vec![
        Case {
            label: "0 件 -> 空 Config",
            inputs: vec![],
            expected_columns: vec![],
            expected_done: None,
        },
        Case {
            label: "全 None -> Todo 1 件",
            inputs: vec![(pb("a.md"), None), (pb("b.md"), None)],
            expected_columns: vec![col("Todo", 0)],
            expected_done: Some("Todo"),
        },
        Case {
            label: "単一 Some(Doing)",
            inputs: vec![(pb("a.md"), Some("Doing".into()))],
            expected_columns: vec![col("Doing", 0)],
            expected_done: Some("Doing"),
        },
        Case {
            label: "Todo / Doing / Done 出現順",
            inputs: vec![
                (pb("a.md"), Some("Todo".into())),
                (pb("b.md"), Some("Doing".into())),
                (pb("c.md"), Some("Done".into())),
            ],
            expected_columns: vec![col("Todo", 0), col("Doing", 1), col("Done", 2)],
            expected_done: Some("Done"),
        },
        Case {
            label: "重複 Todo 2 件 -> 1 列",
            inputs: vec![
                (pb("a.md"), Some("Todo".into())),
                (pb("b.md"), Some("Todo".into())),
            ],
            expected_columns: vec![col("Todo", 0)],
            expected_done: Some("Todo"),
        },
        Case {
            label: "None + Some(Doing) 混在",
            inputs: vec![(pb("a.md"), None), (pb("b.md"), Some("Doing".into()))],
            expected_columns: vec![col("Todo", 0), col("Doing", 1)],
            expected_done: Some("Doing"),
        },
        Case {
            label: "実出現 Todo + None は同一名にまとまる",
            inputs: vec![(pb("a.md"), Some("Todo".into())), (pb("b.md"), None)],
            expected_columns: vec![col("Todo", 0)],
            expected_done: Some("Todo"),
        },
        Case {
            label: "空文字 Some(\"\") はそのまま採用",
            inputs: vec![(pb("a.md"), Some("".into()))],
            expected_columns: vec![col("", 0)],
            expected_done: Some(""),
        },
        Case {
            label: "空白のみ Some(\" \") はそのまま採用",
            inputs: vec![(pb("a.md"), Some(" ".into()))],
            expected_columns: vec![col(" ", 0)],
            expected_done: Some(" "),
        },
        Case {
            label: "前後空白 Some(\"  Todo  \") はそのまま採用（trim しない）",
            inputs: vec![(pb("a.md"), Some("  Todo  ".into()))],
            expected_columns: vec![col("  Todo  ", 0)],
            expected_done: Some("  Todo  "),
        },
        Case {
            label: "ネストパスの path 昇順（PathBuf::Ord）",
            inputs: vec![
                (pb("tasks/a.md"), Some("X".into())),
                (pb("tasks/sub/b.md"), Some("Y".into())),
                (pb("b.md"), Some("Z".into())),
            ],
            expected_columns: vec![col("Z", 0), col("X", 1), col("Y", 2)],
            expected_done: Some("Y"),
        },
        Case {
            label: "Unicode ファイル名の path 昇順（PathBuf::Ord / OS 表現順序）",
            inputs: vec![
                (pb("α.md"), Some("ALPHA".into())),
                (pb("タスク.md"), Some("TASK".into())),
                (pb("a.md"), Some("A".into())),
            ],
            expected_columns: vec![col("A", 0), col("ALPHA", 1), col("TASK", 2)],
            expected_done: Some("TASK"),
        },
    ];

    for case in cases {
        let cfg = build_config_from_statuses(&case.inputs);
        assert_eq!(cfg.version, 1, "case: {}", case.label);
        assert_eq!(cfg.columns, case.expected_columns, "case: {}", case.label);
        assert_eq!(
            cfg.done_column.as_deref(),
            case.expected_done,
            "case: {}",
            case.label
        );
        assert!(
            cfg.card_order.is_empty(),
            "card_order must be empty: case: {}",
            case.label
        );
    }
}

#[test]
fn build_config_from_statuses_defensive_sort_normalizes_input_order() {
    let asc = vec![
        (pb("a.md"), Some("X".into())),
        (pb("b.md"), Some("Y".into())),
    ];
    let desc = vec![
        (pb("b.md"), Some("Y".into())),
        (pb("a.md"), Some("X".into())),
    ];
    let cfg_asc = build_config_from_statuses(&asc);
    let cfg_desc = build_config_from_statuses(&desc);
    assert_eq!(cfg_asc, cfg_desc);
    assert_eq!(
        cfg_asc.columns,
        vec![col("X", 0), col("Y", 1)],
        "path 昇順で X が先になる"
    );
}

// ───────── clean_card_order ─────────

#[test]
fn clean_card_order_parametrized() {
    struct Case {
        label: &'static str,
        card_order: Vec<(&'static str, Vec<&'static str>)>,
        columns: Vec<Column>,
        existing_paths: Vec<&'static str>,
        expected: Vec<(&'static str, Vec<&'static str>)>,
    }

    let cases: Vec<Case> = vec![
        Case {
            label: "0 件 cardOrder -> 空",
            card_order: vec![],
            columns: vec![col("Todo", 0)],
            existing_paths: vec!["a.md"],
            expected: vec![],
        },
        Case {
            label: "全パス存在 -> 変更なし",
            card_order: vec![("Todo", vec!["a.md", "b.md"])],
            columns: vec![col("Todo", 0)],
            existing_paths: vec!["a.md", "b.md"],
            expected: vec![("Todo", vec!["a.md", "b.md"])],
        },
        Case {
            label: "一部パス不在 -> 不在分のみ除去",
            card_order: vec![("Todo", vec!["a.md", "b.md"])],
            columns: vec![col("Todo", 0)],
            existing_paths: vec!["a.md"],
            expected: vec![("Todo", vec!["a.md"])],
        },
        Case {
            label: "全パス不在 -> 値は空 Vec、キーは保持",
            card_order: vec![("Todo", vec!["a.md"])],
            columns: vec![col("Todo", 0)],
            existing_paths: vec![],
            expected: vec![("Todo", vec![])],
        },
        Case {
            label: "columns に無いキー -> キーごと除去",
            card_order: vec![("Ghost", vec!["a.md"])],
            columns: vec![col("Todo", 0)],
            existing_paths: vec!["a.md"],
            expected: vec![],
        },
        Case {
            label: "複合（不在パス + 不在キー）",
            card_order: vec![("Todo", vec!["a.md", "x.md"]), ("Ghost", vec!["y.md"])],
            columns: vec![col("Todo", 0)],
            existing_paths: vec!["a.md"],
            expected: vec![("Todo", vec!["a.md"])],
        },
        Case {
            label: "空 existing_paths -> 全キーで空 Vec",
            card_order: vec![("Todo", vec!["a.md"]), ("Done", vec!["b.md"])],
            columns: vec![col("Todo", 0), col("Done", 1)],
            existing_paths: vec![],
            expected: vec![("Done", vec![]), ("Todo", vec![])],
        },
        Case {
            label: "空 columns -> 全キー除去",
            card_order: vec![("Todo", vec!["a.md"])],
            columns: vec![],
            existing_paths: vec!["a.md"],
            expected: vec![],
        },
        Case {
            label: "元から空 Vec のキーは保持",
            card_order: vec![("Done", vec![])],
            columns: vec![col("Done", 0)],
            existing_paths: vec!["a.md"],
            expected: vec![("Done", vec![])],
        },
        Case {
            label: "キー順序の決定論性（BTreeMap 昇順）",
            card_order: vec![("Z", vec!["a.md"]), ("A", vec!["b.md"])],
            columns: vec![col("A", 0), col("Z", 1)],
            existing_paths: vec!["a.md", "b.md"],
            expected: vec![("A", vec!["b.md"]), ("Z", vec!["a.md"])],
        },
        Case {
            label: "重複パスは除去しない（スコープ外）",
            card_order: vec![("Todo", vec!["a.md", "a.md", "b.md"])],
            columns: vec![col("Todo", 0)],
            existing_paths: vec!["a.md", "b.md"],
            expected: vec![("Todo", vec!["a.md", "a.md", "b.md"])],
        },
    ];

    for case in cases {
        let card_order: CardOrder = case
            .card_order
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.into_iter().map(String::from).collect()))
            .collect();
        let existing: HashSet<String> = case.existing_paths.iter().map(|s| s.to_string()).collect();
        let expected: CardOrder = case
            .expected
            .into_iter()
            .map(|(k, v)| (k.to_string(), v.into_iter().map(String::from).collect()))
            .collect();

        let actual = clean_card_order(&card_order, &case.columns, &existing);
        assert_eq!(actual, expected, "case: {}", case.label);

        let keys: Vec<&String> = actual.keys().collect();
        let mut sorted = keys.clone();
        sorted.sort();
        assert_eq!(keys, sorted, "case (key order): {}", case.label);
    }
}

// ───────── migrate_config ─────────

#[test]
fn migrate_config_passthrough_when_from_version_equals_default() {
    let value = serde_json::json!({
        "version": DEFAULT_VERSION,
        "columns": [],
        "cardOrder": {},
    });
    let migrated = migrate_config(value.clone(), DEFAULT_VERSION).unwrap();
    assert_eq!(migrated, value);
}

#[test]
fn migrate_config_returns_unsupported_for_future_version() {
    let value = serde_json::json!({});
    let err = migrate_config(value, DEFAULT_VERSION + 1).unwrap_err();
    assert_eq!(
        err,
        MigrationError::UnsupportedFromVersion(DEFAULT_VERSION + 1)
    );
}

#[test]
fn migrate_config_passes_through_non_object_for_older_input() {
    struct Case {
        label: &'static str,
        value: serde_json::Value,
    }

    let cases: Vec<Case> = vec![
        Case {
            label: "JSON null",
            value: serde_json::Value::Null,
        },
        Case {
            label: "JSON number",
            value: serde_json::json!(42),
        },
        Case {
            label: "JSON string",
            value: serde_json::json!("not-an-object"),
        },
        Case {
            label: "JSON array",
            value: serde_json::json!([1, 2, 3]),
        },
        Case {
            label: "JSON bool",
            value: serde_json::json!(true),
        },
    ];

    for case in cases {
        let migrated = migrate_config(case.value.clone(), 0).expect(case.label);
        assert_eq!(
            migrated, case.value,
            "case `{}`: non-object input must pass through unchanged for from_version < DEFAULT_VERSION",
            case.label
        );
    }
}

#[test]
fn migrate_config_rewrites_version_to_default_for_older_input() {
    let value = serde_json::json!({
        "version": 0,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {},
    });
    let migrated = migrate_config(value, 0).unwrap();
    let version = migrated
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .expect("version must remain present after migration");
    assert_eq!(version, u64::from(DEFAULT_VERSION));
    // 他フィールドは温存される
    assert_eq!(
        migrated.get("columns"),
        Some(&serde_json::json!([{ "name": "Todo", "order": 0 }]))
    );
    assert_eq!(migrated.get("cardOrder"), Some(&serde_json::json!({})));
}

#[test]
fn migrate_config_parametrized() {
    struct Case {
        label: &'static str,
        from_version: u32,
        expect_ok: bool,
    }

    let cases: Vec<Case> = vec![
        Case {
            label: "from_version 0 (older) -> Ok with version=DEFAULT",
            from_version: 0,
            expect_ok: true,
        },
        Case {
            label: "from_version 1 (default) -> Ok passthrough",
            from_version: 1,
            expect_ok: true,
        },
        Case {
            label: "from_version 2 (future) -> Err Unsupported",
            from_version: 2,
            expect_ok: false,
        },
        Case {
            label: "from_version 999 (far future) -> Err Unsupported",
            from_version: 999,
            expect_ok: false,
        },
    ];

    for case in cases {
        let value = serde_json::json!({
            "version": case.from_version,
            "columns": [],
            "cardOrder": {},
        });
        let result = migrate_config(value, case.from_version);
        match (case.expect_ok, result) {
            (true, Ok(migrated)) => {
                let v = migrated
                    .get("version")
                    .and_then(serde_json::Value::as_u64)
                    .unwrap_or_else(|| panic!("case `{}`: version missing", case.label));
                assert_eq!(
                    v,
                    u64::from(DEFAULT_VERSION),
                    "case `{}`: version must be normalized to DEFAULT_VERSION",
                    case.label
                );
            }
            (false, Err(MigrationError::UnsupportedFromVersion(v))) => {
                assert_eq!(
                    v, case.from_version,
                    "case `{}`: error must carry from_version",
                    case.label
                );
            }
            (expected_ok, actual) => {
                panic!(
                    "case `{}`: expected ok={expected_ok}, got {actual:?}",
                    case.label
                );
            }
        }
    }
}

// ───────── validate_unique_column_names ─────────

#[test]
fn validate_unique_column_names_returns_ok_for_distinct_columns() {
    let columns = vec![col("Todo", 0), col("In Progress", 1), col("Done", 2)];
    assert_eq!(validate_unique_column_names(&columns), Ok(()));
}

#[test]
fn validate_unique_column_names_returns_err_for_first_duplicate() {
    let columns = vec![col("Todo", 0), col("Todo", 1)];
    assert_eq!(
        validate_unique_column_names(&columns),
        Err("Todo".to_string())
    );
}

#[test]
fn validate_unique_column_names_treats_case_as_distinct() {
    let columns = vec![col("Todo", 0), col("todo", 1)];
    assert_eq!(validate_unique_column_names(&columns), Ok(()));
}

#[test]
fn validate_unique_column_names_returns_ok_for_empty_slice() {
    assert_eq!(validate_unique_column_names(&[]), Ok(()));
}

#[test]
fn validate_unique_column_names_treats_whitespace_variants_as_distinct() {
    struct Case {
        label: &'static str,
        columns: Vec<Column>,
    }

    let cases: Vec<Case> = vec![
        Case {
            label: "single empty string",
            columns: vec![col("", 0)],
        },
        Case {
            label: "single whitespace-only",
            columns: vec![col(" ", 0)],
        },
        Case {
            label: "Todo vs leading-space Todo",
            columns: vec![col("Todo", 0), col(" Todo", 1)],
        },
        Case {
            label: "empty + double-space distinct",
            columns: vec![col("", 0), col("  ", 1)],
        },
        Case {
            label: "Todo vs surrounded-space Todo",
            columns: vec![col("Todo", 0), col("  Todo  ", 1)],
        },
    ];

    for case in cases {
        assert_eq!(
            validate_unique_column_names(&case.columns),
            Ok(()),
            "case: {}",
            case.label
        );
    }
}

// ───────── load_or_default (version migration) ─────────

fn write_config(tmp: &TempDir, content: &str) -> PathBuf {
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.json");
    std::fs::write(&path, content).unwrap();
    path
}

#[test]
fn load_or_default_rejects_future_version() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "version": 999,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::UnknownFutureVersion {
            path,
            found,
            supported,
        } => {
            assert_eq!(found, 999);
            assert_eq!(supported, DEFAULT_VERSION);
            assert_eq!(path, tmp.path().join(".spec-board").join("config.json"));
        }
        other => panic!("expected UnknownFutureVersion, got {other:?}"),
    }
}

#[test]
fn load_or_default_creates_backup_and_normalizes_version_for_older_config() {
    let tmp = TempDir::new().unwrap();
    let content = r#"{
        "version": 0,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#;
    let path = write_config(&tmp, content);

    let cfg = load_or_default(tmp.path()).unwrap();

    let bak = path.with_file_name("config.json.bak");
    assert!(bak.is_file(), "backup must exist at {}", bak.display());
    let bak_content = std::fs::read_to_string(&bak).unwrap();
    assert_eq!(
        bak_content, content,
        "backup must contain the original (pre-migration) raw content"
    );
    assert_eq!(cfg.version, DEFAULT_VERSION);
}

#[test]
fn load_or_default_consecutive_loads_normalize_version_consistently() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "version": 0,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );

    let cfg1 = load_or_default(tmp.path()).unwrap();
    let cfg2 = load_or_default(tmp.path()).unwrap();
    assert_eq!(cfg1.version, DEFAULT_VERSION);
    assert_eq!(cfg2.version, DEFAULT_VERSION);
}

#[test]
fn load_or_default_does_not_create_backup_for_current_version() {
    let tmp = TempDir::new().unwrap();
    let path = write_config(
        &tmp,
        r#"{
            "version": 1,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );

    let _ = load_or_default(tmp.path()).unwrap();

    let bak = path.with_file_name("config.json.bak");
    assert!(
        !bak.exists(),
        "backup must NOT exist when loading a current-version config"
    );
}

#[test]
fn load_or_default_overwrites_existing_backup() {
    let tmp = TempDir::new().unwrap();
    let content = r#"{
        "version": 0,
        "columns": [{ "name": "Todo", "order": 0 }],
        "cardOrder": {}
    }"#;
    let path = write_config(&tmp, content);
    let bak = path.with_file_name("config.json.bak");
    std::fs::write(&bak, "STALE BACKUP CONTENT").unwrap();

    let _ = load_or_default(tmp.path()).unwrap();

    let bak_content = std::fs::read_to_string(&bak).unwrap();
    assert_eq!(
        bak_content, content,
        "existing .bak must be silently overwritten with current raw content"
    );
}

#[test]
fn load_or_default_returns_empty_columns_error_for_empty_array() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "version": 1,
            "columns": [],
            "cardOrder": {}
        }"#,
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::EmptyColumns { path } => {
            assert_eq!(path, tmp.path().join(".spec-board").join("config.json"));
        }
        other => panic!("expected EmptyColumns, got {other:?}"),
    }
}

#[test]
fn load_or_default_returns_duplicate_column_name_error() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Todo", "order": 1 }
            ],
            "cardOrder": {}
        }"#,
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::DuplicateColumnName { path, name } => {
            assert_eq!(name, "Todo");
            assert_eq!(path, tmp.path().join(".spec-board").join("config.json"));
        }
        other => panic!("expected DuplicateColumnName, got {other:?}"),
    }
}

#[test]
fn load_or_default_returns_parse_err_for_missing_version_field() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    assert!(
        matches!(err, LoadConfigError::Parse { .. }),
        "expected Parse error for missing version, got {err:?}"
    );
}

#[test]
fn load_or_default_returns_parse_err_for_string_version() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "version": "1",
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    assert!(
        matches!(err, LoadConfigError::Parse { .. }),
        "expected Parse error for string version, got {err:?}"
    );
}

#[test]
fn load_or_default_parse_error_for_current_version_preserves_line_and_column() {
    let tmp = TempDir::new().unwrap();
    // 4 行目に schema 違反（"order" が文字列）を配置
    write_config(
        &tmp,
        "{\n  \"version\": 1,\n  \"columns\": [\n    { \"name\": \"Todo\", \"order\": \"zero\" }\n  ],\n  \"cardOrder\": {}\n}",
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::Parse { source, .. } => {
            assert!(
                source.line() > 0 && source.column() > 0,
                "schema mismatch on current version must preserve line/column info; got line={}, column={}",
                source.line(),
                source.column()
            );
        }
        other => panic!("expected Parse error, got {other:?}"),
    }
}

#[test]
fn load_or_default_parse_error_for_version_out_of_u32_range_preserves_line_and_column() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        "{\n  \"version\": 4294967296,\n  \"columns\": [],\n  \"cardOrder\": {}\n}",
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::Parse { source, .. } => {
            assert!(
                source.line() > 0 && source.column() > 0,
                "out-of-range version error must preserve line/col; got line={}, column={}",
                source.line(),
                source.column()
            );
        }
        other => panic!("expected Parse error, got {other:?}"),
    }
}

#[test]
fn load_or_default_returns_parse_err_for_version_out_of_u32_range() {
    let tmp = TempDir::new().unwrap();
    write_config(
        &tmp,
        r#"{
            "version": 4294967296,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );

    let err = load_or_default(tmp.path()).unwrap_err();
    assert!(
        matches!(err, LoadConfigError::Parse { .. }),
        "expected Parse error for version > u32::MAX, got {err:?}"
    );
}

#[test]
fn load_or_default_returns_backup_failed_when_bak_path_is_directory() {
    let tmp = TempDir::new().unwrap();
    let path = write_config(
        &tmp,
        r#"{
            "version": 0,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );
    let bak = path.with_file_name("config.json.bak");
    std::fs::create_dir(&bak).unwrap();

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::BackupFailed {
            path: failed_path, ..
        } => {
            assert_eq!(failed_path, bak);
        }
        other => panic!("expected BackupFailed, got {other:?}"),
    }
}

#[cfg(unix)]
#[test]
fn write_backup_to_path_does_not_truncate_external_file_via_pre_created_tmp_symlink() {
    let dir = TempDir::new().unwrap();
    let dst = dir.path().join("config.json.bak");
    let tmp = dir.path().join("config.json.bak.tmp");

    let outside = TempDir::new().unwrap();
    let target = outside.path().join("external.txt");
    std::fs::write(&target, "untouched").unwrap();
    std::os::unix::fs::symlink(&target, &tmp).unwrap();

    write_backup_to_path(&dst, "fresh content", &tmp).unwrap();

    let target_content = std::fs::read_to_string(&target).unwrap();
    assert_eq!(
        target_content, "untouched",
        "external file pre-symlinked at tmp path must NOT be overwritten"
    );
    let dst_content = std::fs::read_to_string(&dst).unwrap();
    assert_eq!(dst_content, "fresh content");
}

#[test]
fn load_or_default_cleans_up_stale_backup_tmps_older_than_threshold() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();

    // 閾値（1 時間）以上古い orphan tmp。nanos = 0 (1970 epoch) は確実に古い。
    for (pid, counter) in [(1, 0), (2, 1), (9999, 9)] {
        std::fs::write(
            dir.join(format!("config.json.bak.tmp.{pid}.0.{counter}")),
            "stale content",
        )
        .unwrap();
    }
    // 「直近」相当の tmp は温存されることを確認するため now に近い nanos を持たせる。
    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let live_tmp_name = format!("config.json.bak.tmp.12345.{now_nanos}.0");
    std::fs::write(dir.join(&live_tmp_name), "live content").unwrap();

    // 関係ないファイル（`config.json.bak` / 別名 prefix）は残ること。
    std::fs::write(dir.join("config.json.bak"), "old backup").unwrap();
    std::fs::write(dir.join("unrelated.txt"), "keep me").unwrap();
    // 同じ prefix を共有するが期待 format に合致しないファイルも温存される。
    let unrelated_with_prefix = [
        "config.json.bak.tmp.note.0.keep",
        "config.json.bak.tmp.notes",
        "config.json.bak.tmp.1.0",          // 部品が 2 つ（counter なし）
        "config.json.bak.tmp.1.0.0.extra",  // 部品が 4 つ
        "config.json.bak.tmp.abc.0.0",      // pid が非整数
        "config.json.bak.tmp.1.notnano.0",  // nanos が非整数
        "config.json.bak.tmp.1.0.notcount", // counter が非整数
    ];
    for name in &unrelated_with_prefix {
        std::fs::write(dir.join(name), "keep me too").unwrap();
    }

    let _ = load_or_default(tmp.path()).unwrap();

    let remaining: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();

    for stale in [
        "config.json.bak.tmp.1.0.0",
        "config.json.bak.tmp.2.0.1",
        "config.json.bak.tmp.9999.0.9",
    ] {
        assert!(
            !remaining.iter().any(|n| n == stale),
            "stale tmp file `{stale}` must be cleaned up; remaining: {remaining:?}"
        );
    }
    assert!(
        remaining.iter().any(|n| n == &live_tmp_name),
        "live tmp file (within threshold) must NOT be removed: {remaining:?}"
    );
    assert!(remaining.iter().any(|n| n == "config.json.bak"));
    assert!(remaining.iter().any(|n| n == "unrelated.txt"));
    for name in &unrelated_with_prefix {
        assert!(
            remaining.iter().any(|n| n == name),
            "non-matching prefix file `{name}` must NOT be removed; remaining: {remaining:?}"
        );
    }
}

#[cfg(unix)]
#[test]
fn load_or_default_does_not_cleanup_when_spec_board_is_symlink() {
    let attacker_root = TempDir::new().unwrap();
    let real = TempDir::new().unwrap();
    let real_dir = real.path().join("real-spec-board");
    std::fs::create_dir(&real_dir).unwrap();
    let stale_external = real_dir.join("config.json.bak.tmp.1.0.0");
    std::fs::write(&stale_external, "external orphan").unwrap();

    let attacker_link = attacker_root.path().join(".spec-board");
    std::os::unix::fs::symlink(&real_dir, &attacker_link).unwrap();

    // この attacker_root には config.json を置いていないため、`load_or_default` は
    // backup 経路に入らずに `Config::default()` を返す。本テストの目的は cleanup が
    // symlinked `.spec-board/` を skip して外部ターゲット内のファイルを巻き込み
    // 削除しないことだけを検証すること。
    let _ = load_or_default(attacker_root.path()).expect("default fallback should succeed");

    assert!(
        stale_external.exists(),
        "cleanup must skip a symlinked .spec-board to avoid touching external files"
    );
}

#[test]
fn write_backup_to_path_does_not_truncate_external_file_via_pre_created_tmp_hard_link() {
    let dir = TempDir::new().unwrap();
    let dst = dir.path().join("config.json.bak");
    let tmp = dir.path().join("config.json.bak.tmp");

    let outside = TempDir::new().unwrap();
    let target = outside.path().join("external.txt");
    std::fs::write(&target, "untouched").unwrap();
    std::fs::hard_link(&target, &tmp).unwrap();

    write_backup_to_path(&dst, "fresh content", &tmp).unwrap();

    let target_content = std::fs::read_to_string(&target).unwrap();
    assert_eq!(
        target_content, "untouched",
        "external file pre-hard-linked at tmp path must NOT be truncated"
    );
    let dst_content = std::fs::read_to_string(&dst).unwrap();
    assert_eq!(dst_content, "fresh content");
}

#[test]
fn load_or_default_does_not_truncate_external_file_via_hard_linked_bak() {
    let tmp = TempDir::new().unwrap();
    let path = write_config(
        &tmp,
        r#"{
            "version": 0,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );
    let bak = path.with_file_name("config.json.bak");

    let outside = TempDir::new().unwrap();
    let target = outside.path().join("external.txt");
    std::fs::write(&target, "untouched").unwrap();
    std::fs::hard_link(&target, &bak).unwrap();

    let _ = load_or_default(tmp.path()).unwrap();

    let target_content = std::fs::read_to_string(&target).unwrap();
    assert_eq!(
        target_content, "untouched",
        "external file hard-linked to .bak must NOT be truncated"
    );
}

#[cfg(unix)]
#[test]
fn load_or_default_returns_backup_failed_when_spec_board_dir_is_symlink() {
    let real_root = TempDir::new().unwrap();
    let real_dir = real_root.path().join(".spec-board");
    std::fs::create_dir(&real_dir).unwrap();
    std::fs::write(
        real_dir.join("config.json"),
        r#"{
            "version": 0,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    )
    .unwrap();

    let attacker_root = TempDir::new().unwrap();
    let attacker_spec_board = attacker_root.path().join(".spec-board");
    std::os::unix::fs::symlink(&real_dir, &attacker_spec_board).unwrap();

    let err = load_or_default(attacker_root.path()).unwrap_err();
    match err {
        LoadConfigError::BackupFailed {
            path: failed_path,
            source,
        } => {
            assert_eq!(failed_path, attacker_spec_board);
            assert_eq!(source.kind(), std::io::ErrorKind::InvalidInput);
        }
        other => panic!("expected BackupFailed, got {other:?}"),
    }

    assert!(
        !real_dir.join("config.json.bak").exists(),
        ".bak must NOT be created in the symlink target directory"
    );
}

#[cfg(unix)]
#[test]
fn load_or_default_returns_backup_failed_when_bak_path_is_symlink() {
    let tmp = TempDir::new().unwrap();
    let path = write_config(
        &tmp,
        r#"{
            "version": 0,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#,
    );
    let bak = path.with_file_name("config.json.bak");

    let outside = TempDir::new().unwrap();
    let target = outside.path().join("external.txt");
    std::fs::write(&target, "untouched").unwrap();
    std::os::unix::fs::symlink(&target, &bak).unwrap();

    let err = load_or_default(tmp.path()).unwrap_err();
    match err {
        LoadConfigError::BackupFailed {
            path: failed_path,
            source,
        } => {
            assert_eq!(failed_path, bak);
            assert_eq!(source.kind(), std::io::ErrorKind::InvalidInput);
        }
        other => panic!("expected BackupFailed, got {other:?}"),
    }

    let target_content = std::fs::read_to_string(&target).unwrap();
    assert_eq!(
        target_content, "untouched",
        "external symlink target must not be overwritten"
    );
}
