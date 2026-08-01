use super::*;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tempfile::TempDir;

use crate::config::column_name::ColumnName;
use crate::config::{Column, Config, FsConfigWriter, LabelRegistry, MilestoneRegistry};
use crate::project::open::open_project_impl;
use crate::project::watcher_factory::NoopWatcherFactory;
use crate::project::OpenProjectIntent;
use crate::project_session::SessionRevision;
use crate::state::AppState;
use crate::task::frontmatter::FrontmatterError;
use crate::task::io::FsTaskIo;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use crate::task::task_title::TaskTitle;

fn col(name: &str, order: u32) -> Column {
    Column {
        name: ColumnName::from_lenient(name),
        order,
        color: None,
    }
}

fn config_with(columns: Vec<Column>, done: Option<&str>) -> Config {
    Config {
        version: 1,
        columns,
        card_order: BTreeMap::new(),
        done_column: done.map(ColumnName::from_lenient),
    }
}

fn config_with_card_order(
    columns: Vec<Column>,
    done: Option<&str>,
    card_order: BTreeMap<String, Vec<String>>,
) -> Config {
    Config {
        version: 1,
        columns,
        card_order,
        done_column: done.map(ColumnName::from_lenient),
    }
}

fn task(path: &str, status: &str) -> Task {
    Task {
        draft: false,
        id: TaskFilePath::from_lenient(path),
        file_path: TaskFilePath::from_lenient(path),
        title: TaskTitle::from_lenient("t"),
        status: ColumnName::from_lenient(status),
        priority: None,
        milestone: None,
        labels: Vec::new(),
        parent: None,
        due: None,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: BTreeMap::new(),
        warnings: Vec::new(),
    }
}

fn rename(from: &str, to: &str) -> ColumnRename {
    ColumnRename {
        from: from.into(),
        to: to.into(),
    }
}

#[test]
fn update_columns_args_deserializes_from_camel_case_json() {
    let json = r#"{
        "columns": [{ "name": "Todo", "order": 0 }],
        "doneColumn": "Done",
        "renames": [{ "from": "Old", "to": "New" }]
    }"#;
    let args: UpdateColumnsArgs = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(args.done_column.as_deref(), Some("Done"));
    let renames = args.renames.expect("renames");
    assert_eq!(renames.len(), 1);
    assert_eq!(renames[0].from, "Old");
    assert_eq!(renames[0].to, "New");
    let columns = args.columns.expect("columns");
    assert_eq!(columns.len(), 1);
    assert_eq!(columns[0].name.as_str(), "Todo");
}

#[test]
fn update_columns_args_all_fields_optional() {
    let args: UpdateColumnsArgs = serde_json::from_str("{}").expect("should deserialize empty");
    assert!(args.columns.is_none());
    assert!(args.done_column.is_none());
    assert!(args.renames.is_none());
}

#[test]
fn no_project_open_display() {
    assert_eq!(
        UpdateColumnsError::NoProjectOpen.to_string(),
        "プロジェクトが開かれていません"
    );
}

#[test]
fn state_lock_poisoned_display() {
    assert_eq!(
        UpdateColumnsError::StateLockPoisoned.to_string(),
        "内部状態のロックが破損しました"
    );
}

#[test]
fn empty_columns_display() {
    assert_eq!(
        UpdateColumnsError::EmptyColumns.to_string(),
        "カラムを 0 件にすることはできません"
    );
}

#[test]
fn duplicate_column_name_display() {
    assert_eq!(
        UpdateColumnsError::DuplicateColumnName {
            name: "Todo".into()
        }
        .to_string(),
        "カラム名が重複しています: Todo"
    );
}

#[test]
fn unknown_rename_from_display() {
    assert_eq!(
        UpdateColumnsError::UnknownRenameFrom {
            name: "Missing".into()
        }
        .to_string(),
        "存在しないカラム名のリネームが指定されました: Missing"
    );
}

#[test]
fn duplicate_rename_from_display() {
    assert_eq!(
        UpdateColumnsError::DuplicateRenameFrom {
            name: "Todo".into()
        }
        .to_string(),
        "同じカラム名のリネームが複数指定されました: Todo"
    );
}

#[test]
fn empty_rename_to_display() {
    assert_eq!(
        UpdateColumnsError::EmptyRenameTo.to_string(),
        "リネーム後のカラム名が空です"
    );
}

#[test]
fn unknown_done_column_display() {
    assert_eq!(
        UpdateColumnsError::UnknownDoneColumn {
            name: "Ghost".into()
        }
        .to_string(),
        "指定された完了カラムが存在しません: Ghost"
    );
}

#[test]
fn rename_to_missing_from_columns_display() {
    assert_eq!(
        UpdateColumnsError::RenameToMissingFromColumns { name: "New".into() }.to_string(),
        "リネーム後のカラム名が新しい columns に含まれていません: New"
    );
}

#[test]
fn rename_parse_failed_display() {
    let err = UpdateColumnsError::RenameParseFailed {
        path: PathBuf::from("tasks/broken.md"),
        source: serde_yaml_ng::from_str::<serde_yaml_ng::Value>("k: [unclosed")
            .map(|_| panic!("must fail"))
            .map_err(FrontmatterError::from)
            .unwrap_err(),
    };
    assert_eq!(
        err.to_string(),
        "カラム名の変更中にフロントマターのパースに失敗しました"
    );
}

#[test]
fn rename_missing_frontmatter_display() {
    assert_eq!(
        UpdateColumnsError::RenameMissingFrontmatter {
            path: PathBuf::from("tasks/x.md"),
        }
        .to_string(),
        "カラム名の変更対象 md にフロントマターがありません: tasks/x.md"
    );
}

#[test]
fn rename_write_failed_display() {
    let err = UpdateColumnsError::RenameWriteFailed {
        path: PathBuf::from("tasks/x.md"),
        source: TaskIoError::from(std::io::Error::other("boom")),
    };
    assert_eq!(
        err.to_string(),
        "カラム名の変更中にエラーが発生しました。変更を元に戻しました"
    );
}

#[test]
fn rename_rollback_failed_display() {
    let err = UpdateColumnsError::RenameRollbackFailed {
        path: PathBuf::from("tasks/x.md"),
        source: TaskIoError::from(std::io::Error::other("boom")),
    };
    assert_eq!(
        err.to_string(),
        "カラム名の変更失敗後のロールバックに失敗しました: tasks/x.md"
    );
}

#[test]
fn config_serialize_failed_display() {
    let serde_err = serde_json::from_str::<serde_json::Value>("not json").unwrap_err();
    let err = UpdateColumnsError::ConfigSerializeFailed { source: serde_err };
    assert_eq!(err.to_string(), "config.json のシリアライズに失敗しました");
}

#[test]
fn config_write_failed_display() {
    let err = UpdateColumnsError::ConfigWriteFailed {
        path: PathBuf::from(".spec-board/config.json"),
        source: std::io::Error::other("boom"),
    };
    assert_eq!(
        err.to_string(),
        "config.json の書き込みに失敗しました: .spec-board/config.json"
    );
}

#[test]
fn app_state_error_converts_to_state_lock_poisoned() {
    let err: UpdateColumnsError = AppStateError::LockPoisoned.into();
    assert!(matches!(err, UpdateColumnsError::StateLockPoisoned));
}

#[test]
fn write_ignore_lock_poisoned_converts_to_state_lock_poisoned() {
    let err: UpdateColumnsError = WriteIgnoreError::LockPoisoned.into();
    assert!(matches!(err, UpdateColumnsError::StateLockPoisoned));
}

#[test]
fn column_rename_deserializes_camel_case() {
    let json = r#"{ "from": "A", "to": "B" }"#;
    let r: ColumnRename = serde_json::from_str(json).expect("should deserialize");
    assert_eq!(r.from, "A");
    assert_eq!(r.to, "B");
}

#[test]
fn column_in_args_deserializes_from_camel_case_name() {
    let json = r#"{ "columns": [{ "name": "In Progress", "order": 1 }] }"#;
    let args: UpdateColumnsArgs = serde_json::from_str(json).expect("should deserialize");
    let columns = args.columns.expect("columns");
    let expected = Column {
        name: ColumnName::from_lenient("In Progress"),
        order: 1,
        color: None,
    };
    assert_eq!(columns[0], expected);
}

// ───── plan_update_columns aggregate tests ─────

#[test]
fn plan_args_all_none_returns_noop_plan() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs::default();
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert!(plan.is_noop);
    assert_eq!(plan.new_config, config);
    assert!(plan.rename_targets.is_empty());
}

#[test]
fn plan_empty_renames_array_is_treated_as_noop() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        renames: Some(Vec::new()),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert!(
        plan.is_noop,
        "空配列の renames は未指定と同義として no-op 扱いにすべき"
    );
    assert_eq!(plan.new_config, config);
}

#[test]
fn plan_columns_only_reorder_returns_new_config_with_same_names() {
    let config = config_with(
        vec![col("Todo", 0), col("In Progress", 1), col("Done", 2)],
        Some("Done"),
    );
    let new_cols = vec![col("Done", 0), col("In Progress", 1), col("Todo", 2)];
    let args = UpdateColumnsArgs {
        columns: Some(new_cols.clone()),
        ..Default::default()
    };

    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert!(!plan.is_noop);
    assert_eq!(plan.new_config.columns, new_cols);
    assert!(plan.rename_targets.is_empty());
}

#[test]
fn plan_columns_only_add_appends_new_column() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let new_cols = vec![col("Todo", 0), col("Doing", 1), col("Done", 2)];
    let args = UpdateColumnsArgs {
        columns: Some(new_cols.clone()),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(plan.new_config.columns, new_cols);
}

#[test]
fn plan_columns_only_remove_drops_column_and_cleans_card_order() {
    let mut card_order = BTreeMap::new();
    card_order.insert("Todo".into(), vec!["a.md".into()]);
    card_order.insert("Doing".into(), vec!["b.md".into()]);
    card_order.insert("Done".into(), vec!["c.md".into()]);
    let config = config_with_card_order(
        vec![col("Todo", 0), col("Doing", 1), col("Done", 2)],
        Some("Done"),
        card_order,
    );
    let new_cols = vec![col("Todo", 0), col("Done", 1)];
    let args = UpdateColumnsArgs {
        columns: Some(new_cols.clone()),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(plan.new_config.columns, new_cols);
    assert!(plan.new_config.card_order.contains_key("Todo"));
    assert!(plan.new_config.card_order.contains_key("Done"));
    assert!(!plan.new_config.card_order.contains_key("Doing"));
}

#[test]
fn plan_done_column_only_updates_done_column() {
    let config = config_with(
        vec![col("Todo", 0), col("Doing", 1), col("Done", 2)],
        Some("Done"),
    );
    let args = UpdateColumnsArgs {
        done_column: Some("Doing".into()),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(
        plan.new_config.done_column.as_ref().map(|d| d.as_str()),
        Some("Doing")
    );
}

#[test]
fn plan_renames_only_swaps_card_order_keys() {
    let mut card_order = BTreeMap::new();
    card_order.insert("Todo".into(), vec!["a.md".into()]);
    card_order.insert("Doing".into(), vec!["b.md".into()]);
    let config = config_with_card_order(
        vec![col("Todo", 0), col("Doing", 1)],
        Some("Doing"),
        card_order,
    );
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Doing", "In Progress")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert!(plan.new_config.card_order.contains_key("In Progress"));
    assert_eq!(
        plan.new_config.card_order.get("In Progress").unwrap(),
        &vec!["b.md".to_string()]
    );
    assert!(!plan.new_config.card_order.contains_key("Doing"));
    assert!(plan
        .new_config
        .columns
        .iter()
        .any(|c| c.name.as_str() == "In Progress"));
    assert_eq!(
        plan.new_config.done_column.as_ref().map(|d| d.as_str()),
        Some("In Progress")
    );
}

#[test]
fn plan_renames_with_columns_uses_columns_as_final_shape() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let final_cols = vec![col("Todo", 0), col("Finished", 1)];
    let args = UpdateColumnsArgs {
        columns: Some(final_cols.clone()),
        renames: Some(vec![rename("Done", "Finished")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(plan.new_config.columns, final_cols);
}

#[test]
fn plan_done_column_none_args_with_existing_done_in_renames_follows_rename() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Done", "Finished")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(
        plan.new_config.done_column.as_ref().map(|d| d.as_str()),
        Some("Finished")
    );
}

#[test]
fn plan_rename_from_equals_to_is_skipped_idempotently() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "Todo")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(plan.new_config.columns, config.columns);
    assert!(plan.rename_targets.is_empty());
}

#[test]
fn plan_card_order_swap_a_to_b_and_b_to_a_preserves_both_entries() {
    let mut card_order = BTreeMap::new();
    card_order.insert("A".into(), vec!["a.md".into()]);
    card_order.insert("B".into(), vec!["b.md".into()]);
    let config = config_with_card_order(vec![col("A", 0), col("B", 1)], Some("B"), card_order);
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("A", "B"), rename("B", "A")]),
        ..Default::default()
    };
    // A→B と B→A の相互 rename は重複を生まず、columns ["A", "B"] は
    // rename_map {"A":"B","B":"A"} の適用で [B, A] になる。
    // card_order のキーも入れ替わり {"B":[a.md], "A":[b.md]} になる。
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(
        plan.new_config.card_order.get("B").unwrap(),
        &vec!["a.md".to_string()]
    );
    assert_eq!(
        plan.new_config.card_order.get("A").unwrap(),
        &vec!["b.md".to_string()]
    );
}

#[test]
fn plan_card_order_collapse_merges_paths_first_occurrence_wins() {
    // 旧 card_order に A と B 両方の entry がある状態で、args.columns で B のみを残し
    // rename A→B を指定すると、A の paths と B の paths が同じ new_key="B" に集約される。
    // 後勝ち上書きで一方のリストが消えないよう、append + first-occurrence wins でマージされる。
    let mut card_order = BTreeMap::new();
    card_order.insert("A".into(), vec!["a.md".into(), "shared.md".into()]);
    card_order.insert("B".into(), vec!["b.md".into(), "shared.md".into()]);
    let config = config_with_card_order(vec![col("A", 0), col("B", 1)], Some("B"), card_order);
    let args = UpdateColumnsArgs {
        columns: Some(vec![col("B", 0)]),
        renames: Some(vec![rename("A", "B")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    let merged = plan.new_config.card_order.get("B").expect("B exists");
    // A の entries (a.md, shared.md) → B の entries (b.md) の順で、shared.md は重複除去で
    // 1 つだけ残る。順序は BTreeMap の iteration 順（A, B）に従う。
    assert_eq!(
        merged,
        &vec![
            "a.md".to_string(),
            "shared.md".to_string(),
            "b.md".to_string()
        ]
    );
}

#[test]
fn plan_done_column_none_args_keeps_existing_done_column_when_not_renamed() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "To Do")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(
        plan.new_config.done_column.as_ref().map(|d| d.as_str()),
        Some("Done")
    );
}

#[test]
fn plan_done_column_none_args_with_existing_done_column_none_returns_none() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], None);
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "To Do")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert!(plan.new_config.done_column.is_none());
}

#[test]
fn plan_new_config_keeps_self_version() {
    let mut config = config_with(vec![col("Todo", 0)], Some("Todo"));
    config.version = 42;
    let args = UpdateColumnsArgs {
        columns: Some(vec![col("Todo", 0), col("Done", 1)]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert_eq!(plan.new_config.version, 42);
}

#[test]
fn plan_empty_columns_returns_empty_columns_error() {
    let config = config_with(vec![col("Todo", 0)], Some("Todo"));
    let args = UpdateColumnsArgs {
        columns: Some(vec![]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    assert!(matches!(err, UpdateColumnsError::EmptyColumns));
}

#[test]
fn plan_duplicate_column_name_returns_duplicate_error() {
    let config = config_with(vec![col("Todo", 0)], Some("Todo"));
    let args = UpdateColumnsArgs {
        columns: Some(vec![col("Todo", 0), col("Todo", 1)]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    match err {
        UpdateColumnsError::DuplicateColumnName { name } => assert_eq!(name, "Todo"),
        other => panic!("expected DuplicateColumnName, got {other:?}"),
    }
}

#[test]
fn plan_unknown_rename_from_returns_unknown_rename_from_error() {
    let config = config_with(vec![col("Todo", 0)], Some("Todo"));
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Missing", "New")]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    match err {
        UpdateColumnsError::UnknownRenameFrom { name } => assert_eq!(name, "Missing"),
        other => panic!("expected UnknownRenameFrom, got {other:?}"),
    }
}

#[test]
fn plan_duplicate_rename_from_returns_duplicate_rename_from_error() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "A"), rename("Todo", "B")]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    match err {
        UpdateColumnsError::DuplicateRenameFrom { name } => assert_eq!(name, "Todo"),
        other => panic!("expected DuplicateRenameFrom, got {other:?}"),
    }
}

#[test]
fn plan_empty_rename_to_returns_empty_rename_to_error() {
    let config = config_with(vec![col("Todo", 0)], Some("Todo"));
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "")]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    assert!(matches!(err, UpdateColumnsError::EmptyRenameTo));
}

#[test]
fn plan_unknown_done_column_returns_unknown_done_column_error() {
    let config = config_with(vec![col("Todo", 0)], Some("Todo"));
    let args = UpdateColumnsArgs {
        done_column: Some("Ghost".into()),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    match err {
        UpdateColumnsError::UnknownDoneColumn { name } => assert_eq!(name, "Ghost"),
        other => panic!("expected UnknownDoneColumn, got {other:?}"),
    }
}

#[test]
fn plan_done_column_pointing_to_removed_column_returns_unknown_done_column_error() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        columns: Some(vec![col("Todo", 0)]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    match err {
        UpdateColumnsError::UnknownDoneColumn { name } => assert_eq!(name, "Done"),
        other => panic!("expected UnknownDoneColumn, got {other:?}"),
    }
}

#[test]
fn plan_rename_targets_excludes_tasks_with_non_renamed_status() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let tasks = vec![task("tasks/a.md", "Todo"), task("tasks/b.md", "Done")];
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "To Do")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &tasks).expect("ok");
    assert_eq!(plan.rename_targets.len(), 1);
    assert_eq!(plan.rename_targets[0].rel_path.as_str(), "tasks/a.md");
    assert_eq!(plan.rename_targets[0].new_status, "To Do");
    assert_eq!(plan.rename_targets[0].old_status, "Todo");
}

#[test]
fn plan_card_order_orphan_key_is_dropped_after_rename() {
    let mut card_order = BTreeMap::new();
    card_order.insert("Old".into(), vec!["x.md".into()]);
    let config = config_with_card_order(vec![col("Todo", 0)], Some("Todo"), card_order);
    let args = UpdateColumnsArgs {
        columns: Some(vec![col("Todo", 0), col("Done", 1)]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &[]).expect("ok");
    assert!(!plan.new_config.card_order.contains_key("Old"));
}

#[test]
fn plan_renames_with_columns_lacking_rename_to_returns_rename_to_missing_from_columns() {
    let config = config_with(vec![col("Todo", 0), col("Done", 1)], Some("Done"));
    let args = UpdateColumnsArgs {
        columns: Some(vec![col("Todo", 0), col("Done", 1)]),
        renames: Some(vec![rename("Done", "Archived")]),
        ..Default::default()
    };
    let err = config.plan_update_columns(&args, &[]).unwrap_err();
    match err {
        UpdateColumnsError::RenameToMissingFromColumns { name } => assert_eq!(name, "Archived"),
        other => panic!("expected RenameToMissingFromColumns, got {other:?}"),
    }
}

#[test]
fn plan_renames_only_rename_targets_collected_for_matching_status() {
    let config = config_with(vec![col("Todo", 0), col("Doing", 1)], Some("Doing"));
    let tasks = vec![
        task("tasks/a.md", "Todo"),
        task("tasks/b.md", "Doing"),
        task("tasks/c.md", "Todo"),
    ];
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("Todo", "To Do")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &tasks).expect("ok");
    assert_eq!(plan.rename_targets.len(), 2);
    let paths: Vec<&str> = plan
        .rename_targets
        .iter()
        .map(|t| t.rel_path.as_str())
        .collect();
    assert!(paths.contains(&"tasks/a.md"));
    assert!(paths.contains(&"tasks/c.md"));
}

#[test]
fn plan_rename_targets_includes_old_and_new_status() {
    let config = config_with(vec![col("A", 0), col("B", 1)], Some("B"));
    let tasks = vec![task("a.md", "A")];
    let args = UpdateColumnsArgs {
        renames: Some(vec![rename("A", "Alpha")]),
        ..Default::default()
    };
    let plan = config.plan_update_columns(&args, &tasks).expect("ok");
    assert_eq!(plan.rename_targets[0].old_status, "A");
    assert_eq!(plan.rename_targets[0].new_status, "Alpha");
}

// ───── rewrite_status_in_md tests ─────

#[test]
fn rewrite_status_in_md_replaces_status_in_extras() {
    let input = b"---\ntitle: Foo\nstatus: Todo\n---\nbody text\n";
    let out = rewrite_status_in_md(input, "Doing")
        .expect("ok")
        .expect("frontmatter present");

    let parsed = crate::task::frontmatter::parse_bytes(&out)
        .expect("re-parse ok")
        .expect("frontmatter present");
    let status_val = parsed
        .frontmatter
        .extras
        .get(serde_yaml_ng::Value::String("status".into()))
        .expect("status key present");
    assert_eq!(status_val.as_str(), Some("Doing"));
}

#[test]
fn rewrite_status_in_md_without_frontmatter_returns_ok_none() {
    let input = b"no frontmatter here\n";
    let out = rewrite_status_in_md(input, "Doing").expect("ok");
    assert!(out.is_none());
}

#[test]
fn rewrite_status_in_md_inserts_status_when_missing() {
    let input = b"---\ntitle: Foo\n---\nbody\n";
    let out = rewrite_status_in_md(input, "New")
        .expect("ok")
        .expect("frontmatter present");

    let parsed = crate::task::frontmatter::parse_bytes(&out)
        .expect("re-parse ok")
        .expect("frontmatter present");
    let status_val = parsed
        .frontmatter
        .extras
        .get(serde_yaml_ng::Value::String("status".into()))
        .expect("status key inserted");
    assert_eq!(status_val.as_str(), Some("New"));
}

#[test]
fn rewrite_status_in_md_propagates_frontmatter_parse_error() {
    let input = b"---\ntitle: [unclosed\n---\nbody\n";
    let err = rewrite_status_in_md(input, "Doing").unwrap_err();
    assert!(matches!(err, FrontmatterError::InvalidYaml(_)));
}

// ───── E2E tests for update_columns_impl ─────

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn write_md(root: &Path, rel: &str, content: &str) {
    let abs = root.join(rel);
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(abs, content).unwrap();
}

fn write_initial_config(root: &Path, json: &str) {
    let dir = root.join(".spec-board");
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("config.json"), json).unwrap();
}

fn open_with_noop(state: Arc<AppState>, path: &Path) {
    let intent = OpenProjectIntent::try_from(path.to_str().expect("utf-8").to_string())
        .expect("non-empty path");
    open_project_impl(
        &state,
        &intent,
        &crate::config::label_registry_store(intent.as_path()),
        &crate::config::milestone_registry_store(intent.as_path()),
        &NoopWatcherFactory,
    )
    .expect("open should succeed");
}

fn read_config_json(root: &Path) -> Config {
    let raw = fs::read_to_string(root.join(".spec-board/config.json")).unwrap();
    serde_json::from_str(&raw).unwrap()
}

fn read_status(root: &Path, rel: &str) -> String {
    let content = fs::read_to_string(root.join(rel)).unwrap();
    let parsed = crate::task::frontmatter::parse(&content)
        .expect("ok")
        .expect("frontmatter present");
    parsed
        .frontmatter
        .extras
        .get(serde_yaml_ng::Value::String("status".into()))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default()
}

#[test]
fn fs_config_writer_writes_via_atomic_tmp_and_rename() {
    let dir = tempdir();
    let dst = dir.path().join("config.json");
    let writer = FsConfigWriter;
    writer.write_atomic(&dst, "{\"hello\":1}").unwrap();
    assert_eq!(fs::read_to_string(&dst).unwrap(), "{\"hello\":1}");
}

#[test]
fn e2e_args_all_none_is_noop_and_does_not_write_files() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", "---\nstatus: Todo\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let before_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();
    let before_md = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();

    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs::default(),
    )
    .expect("noop ok");

    let after_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();
    let after_md = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(before_cfg, after_cfg);
    assert_eq!(before_md, after_md);
}

#[test]
fn e2e_columns_reorder_writes_config_json_and_guide_md() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Doing", "order": 1 },
                { "name": "Done", "order": 2 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let new_cols = vec![
        Column {
            name: ColumnName::from_lenient("Done"),
            order: 0,
            color: None,
        },
        Column {
            name: ColumnName::from_lenient("Doing"),
            order: 1,
            color: None,
        },
        Column {
            name: ColumnName::from_lenient("Todo"),
            order: 2,
            color: None,
        },
    ];
    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            columns: Some(new_cols.clone()),
            ..Default::default()
        },
    )
    .expect("ok");

    let on_disk = read_config_json(dir.path());
    assert_eq!(on_disk.columns, new_cols);
    let state_cfg = state.test_config().unwrap().unwrap();
    assert_eq!(state_cfg.columns, new_cols);

    let guide = fs::read_to_string(dir.path().join(".spec-board/GUIDE.md")).unwrap();
    assert!(guide.contains("- Done"));
    assert!(guide.contains("- Doing"));
    assert!(guide.contains("- Todo"));
}

#[test]
fn e2e_done_column_update_persists() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Doing", "order": 1 },
                { "name": "Done", "order": 2 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            done_column: Some("Doing".into()),
            ..Default::default()
        },
    )
    .expect("ok");

    let on_disk = read_config_json(dir.path());
    assert_eq!(
        on_disk.done_column.as_ref().map(|c| c.as_str()),
        Some("Doing")
    );
}

#[test]
fn e2e_renames_updates_md_status_and_tasks_cache() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Doing", "order": 1 },
                { "name": "Done", "order": 2 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Doing\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/c.md",
        "---\ntitle: C\nstatus: Done\n---\nbody\n",
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .expect("ok");

    assert_eq!(read_status(dir.path(), "tasks/a.md"), "To Do");
    assert_eq!(read_status(dir.path(), "tasks/b.md"), "Doing");
    assert_eq!(read_status(dir.path(), "tasks/c.md"), "Done");

    let snapshot = state.test_tasks_snapshot().unwrap();
    let a = snapshot
        .iter()
        .find(|t| t.file_path.as_str() == "tasks/a.md")
        .unwrap();
    assert_eq!(a.status.as_str(), "To Do");

    let on_disk = read_config_json(dir.path());
    assert!(on_disk.columns.iter().any(|c| c.name.as_str() == "To Do"));
    assert!(!on_disk.columns.iter().any(|c| c.name.as_str() == "Todo"));
}

#[test]
fn e2e_renames_with_card_order_swap_persists_in_config_json() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {
                "Todo": ["tasks/a.md"],
                "Done": ["tasks/c.md"]
            },
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", "---\nstatus: Todo\n---\n");
    write_md(dir.path(), "tasks/c.md", "---\nstatus: Done\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .expect("ok");

    let on_disk = read_config_json(dir.path());
    assert!(on_disk.card_order.contains_key("To Do"));
    assert_eq!(
        on_disk.card_order.get("To Do").unwrap(),
        &vec!["tasks/a.md".to_string()]
    );
    assert!(!on_disk.card_order.contains_key("Todo"));
}

// ───── fault injection mocks ─────

use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use crate::config::ConfigWriter;
use crate::task::io::{TaskIo, TaskIoError};

/// 指定回数目の write_existing で `io::Error` を返す test-only `TaskIo`。
/// それ以外の操作 (read / ensure_dir / write_new / remove) は `FsTaskIo` に委譲する。
struct FailingTaskIo {
    inner: FsTaskIo,
    fail_write_indices: Mutex<HashSet<usize>>,
    write_existing_calls: AtomicUsize,
    fail_read_for: Mutex<HashSet<PathBuf>>,
    read_calls: AtomicUsize,
}

impl FailingTaskIo {
    fn new() -> Self {
        Self {
            inner: FsTaskIo,
            fail_write_indices: Mutex::new(HashSet::new()),
            write_existing_calls: AtomicUsize::new(0),
            fail_read_for: Mutex::new(HashSet::new()),
            read_calls: AtomicUsize::new(0),
        }
    }

    fn fail_write_at_indices<I: IntoIterator<Item = usize>>(self, indices: I) -> Self {
        self.fail_write_indices.lock().unwrap().extend(indices);
        self
    }

    fn fail_read_for(self, path: PathBuf) -> Self {
        self.fail_read_for.lock().unwrap().insert(path);
        self
    }

    fn read_call_count(&self) -> usize {
        self.read_calls.load(Ordering::Relaxed)
    }
}

impl TaskIo for FailingTaskIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
        self.inner.ensure_dir(dir)
    }
    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        self.inner.write_new(path, bytes)
    }
    fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        let nth = self.write_existing_calls.fetch_add(1, Ordering::Relaxed);
        if self.fail_write_indices.lock().unwrap().contains(&nth) {
            return Err(TaskIoError::from(std::io::Error::other(format!(
                "injected fault on write #{nth}"
            ))));
        }
        self.inner.write_existing(path, bytes)
    }
    fn remove(&self, path: &Path) -> Result<(), TaskIoError> {
        self.inner.remove(path)
    }
    fn read(&self, path: &Path) -> Result<Vec<u8>, TaskIoError> {
        self.read_calls.fetch_add(1, Ordering::Relaxed);
        if self.fail_read_for.lock().unwrap().contains(path) {
            return Err(TaskIoError::from(std::io::Error::other(format!(
                "injected read fault for {}",
                path.display()
            ))));
        }
        self.inner.read(path)
    }
}

/// `write_atomic` を必ず失敗させる test-only `ConfigWriter`。
struct FailingConfigWriter {
    force_failure: bool,
}

impl ConfigWriter for FailingConfigWriter {
    fn write_atomic(&self, _dst: &Path, _content: &str) -> std::io::Result<()> {
        if self.force_failure {
            Err(std::io::Error::other("injected config write fault"))
        } else {
            Ok(())
        }
    }
}

#[derive(Default)]
struct CountingConfigWriter {
    calls: AtomicUsize,
}

impl ConfigWriter for CountingConfigWriter {
    fn write_atomic(&self, _dst: &Path, _content: &str) -> std::io::Result<()> {
        self.calls.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }
}

struct ConflictAfterConfigWrite<'a> {
    state: &'a AppState,
    calls: AtomicUsize,
}

impl ConfigWriter for ConflictAfterConfigWrite<'_> {
    fn write_atomic(&self, _dst: &Path, _content: &str) -> std::io::Result<()> {
        self.calls.fetch_add(1, Ordering::SeqCst);
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

#[test]
fn revision_exhaustion_preflight_performs_no_io_and_keeps_state_and_markers() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    state.seed_session_revision_for_test(SessionRevision::from_raw(u64::MAX));

    let before = state.require_session_snapshot().unwrap();
    let resources = state.resources_for(before.version()).unwrap();
    let io = FailingTaskIo::new();
    let config_writer = CountingConfigWriter::default();

    let error = update_columns_impl(
        &state,
        &io,
        &config_writer,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .expect_err("MAX revision must fail before I/O");

    assert!(matches!(
        error,
        UpdateColumnsError::SessionWrite(SessionWriteError::RevisionExhausted(_))
    ));
    assert_eq!(0, io.read_call_count());
    assert_eq!(0, io.write_existing_calls.load(Ordering::Relaxed));
    assert_eq!(0, config_writer.calls.load(Ordering::Relaxed));
    assert!(resources.write_ignore().is_empty().unwrap());

    let after = state.require_session_snapshot().unwrap();
    assert_eq!(before.version(), after.version());
    assert_eq!(before.config(), after.config());
    assert_eq!(before.tasks(), after.tasks());
}

#[test]
fn disk_success_conflict_resync_uses_the_injected_config_loader() {
    let dir = tempdir();
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());
    let writer = ConflictAfterConfigWrite {
        state: &state,
        calls: AtomicUsize::new(0),
    };
    let loader_calls = AtomicUsize::new(0);
    let recovered_config = config_with(vec![col("Recovered", 0)], None);
    let load_config = |_root: &Path| {
        loader_calls.fetch_add(1, Ordering::SeqCst);
        Ok::<Config, LoadConfigError>(recovered_config.clone())
    };

    let error = update_columns_impl_with_loader(
        &state,
        &FsTaskIo,
        &writer,
        &load_config,
        UpdateColumnsArgs {
            columns: Some(vec![col("Queued", 0), col("Done", 1)]),
            ..Default::default()
        },
    )
    .expect_err("original conflict");

    assert!(matches!(
        error,
        UpdateColumnsError::SessionWrite(SessionWriteError::Conflict(_))
    ));
    assert_eq!(1, writer.calls.load(Ordering::SeqCst));
    assert_eq!(1, loader_calls.load(Ordering::SeqCst));
    assert_eq!(
        &recovered_config,
        state.require_session_snapshot().unwrap().config()
    );
}

#[test]
fn fault_read_original_fails_does_not_modify_anything() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", "---\nstatus: Todo\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let before_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();
    let before_md = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();

    let io = FailingTaskIo::new().fail_read_for(dir.path().join("tasks/a.md"));
    let err = update_columns_impl(
        &state,
        &io,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    assert!(matches!(err, UpdateColumnsError::RenameReadFailed { .. }));
    let after_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();
    let after_md = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    assert_eq!(before_cfg, after_cfg);
    assert_eq!(before_md, after_md);
}

#[test]
fn rename_read_failed_display() {
    let err = UpdateColumnsError::RenameReadFailed {
        path: PathBuf::from("tasks/x.md"),
        source: TaskIoError::from(std::io::Error::other("boom")),
    };
    assert_eq!(
        err.to_string(),
        "カラム名の変更対象 md の読み込みに失敗しました: tasks/x.md"
    );
}

#[test]
fn fault_rewrite_fails_at_index_2_rolls_back_first_two_files() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/c.md",
        "---\ntitle: C\nstatus: Todo\n---\nbody\n",
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let before_a = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    let before_b = fs::read_to_string(dir.path().join("tasks/b.md")).unwrap();
    let before_c = fs::read_to_string(dir.path().join("tasks/c.md")).unwrap();
    let before_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();

    // 3rd write (index 2) fails. We don't know order of HashSet snapshot iteration
    // so just verify "all 3 files end up at original content" + cfg unchanged.
    let io = FailingTaskIo::new().fail_write_at_indices([2]);
    let err = update_columns_impl(
        &state,
        &io,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    assert!(matches!(err, UpdateColumnsError::RenameWriteFailed { .. }));
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).unwrap(),
        before_a
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/b.md")).unwrap(),
        before_b
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/c.md")).unwrap(),
        before_c
    );
    assert_eq!(
        fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap(),
        before_cfg
    );

    let snap = state.test_tasks_snapshot().unwrap();
    for t in &snap {
        assert_eq!(t.status.as_str(), "Todo");
    }
}

#[test]
fn fault_rewrite_fails_then_rollback_also_fails_returns_rename_rollback_failed() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\nbody\n",
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    // 2nd write (index 1) fails. Then rollback writes the 1st file back (index 2), which also fails.
    let io = FailingTaskIo::new().fail_write_at_indices([1, 2]);

    let err = update_columns_impl(
        &state,
        &io,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    assert!(matches!(
        err,
        UpdateColumnsError::RenameRollbackFailed { .. }
    ));
}

#[test]
fn fault_config_write_fails_after_all_md_rewritten_rolls_back_all_md() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\nbody\n",
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let before_a = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    let before_b = fs::read_to_string(dir.path().join("tasks/b.md")).unwrap();
    let before_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();

    let err = update_columns_impl(
        &state,
        &FsTaskIo,
        &FailingConfigWriter {
            force_failure: true,
        },
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    assert!(matches!(err, UpdateColumnsError::ConfigWriteFailed { .. }));
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).unwrap(),
        before_a
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/b.md")).unwrap(),
        before_b
    );
    assert_eq!(
        fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap(),
        before_cfg
    );

    // cache 未更新
    let snap = state.test_tasks_snapshot().unwrap();
    for t in &snap {
        assert_eq!(t.status.as_str(), "Todo");
    }
}

// WriteIgnoreError::LockPoisoned → StateLockPoisoned の変換は
// `write_ignore_lock_poisoned_converts_to_state_lock_poisoned` で単体的に検証済み。
// AppState 経由の poison は registry の private 内部に直接アクセスできないため
// integration として再現するのではなく From 変換側で担保する。

#[test]
fn fault_frontmatter_parse_error_returns_rename_parse_failed_and_rolls_back() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    // 壊れた frontmatter（YAML パース失敗）
    write_md(
        dir.path(),
        "tasks/broken.md",
        "---\ntitle: [unclosed\nstatus: Todo\n---\n",
    );

    let state = Arc::new(AppState::new());
    // 壊れた frontmatter は open_project の parse でスキップされる可能性があるため
    // 直接 AppState を組み立てて Task をキャッシュに注入する。簡略化として `task` factory を使い、
    // tasks_cache に Todo な Task を 2 つ入れる。
    let cfg: Config = serde_json::from_str(
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    )
    .unwrap();
    state.install_test_project(
        dir.path(),
        cfg,
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        vec![task("tasks/a.md", "Todo"), task("tasks/broken.md", "Todo")],
    );

    let before_a = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    let before_broken = fs::read_to_string(dir.path().join("tasks/broken.md")).unwrap();
    let before_cfg = fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap();

    let err = update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    match err {
        UpdateColumnsError::RenameParseFailed { path, .. } => {
            assert!(path.ends_with("tasks/broken.md"));
        }
        UpdateColumnsError::RenameWriteFailed { .. } => {
            // 壊れた frontmatter file の order によっては write 経路に乗らず終わる可能性もあるが、
            // 本テストでは parse error が出る経路を期待する。Ok(None) 経路は別テストに分離。
            panic!("expected RenameParseFailed but got RenameWriteFailed");
        }
        other => panic!("expected RenameParseFailed, got {other:?}"),
    }

    // rollback で a.md は元に戻る（broken.md は parse fail なので元のまま）
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).unwrap(),
        before_a
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/broken.md")).unwrap(),
        before_broken
    );
    assert_eq!(
        fs::read_to_string(dir.path().join(".spec-board/config.json")).unwrap(),
        before_cfg
    );
}

#[test]
fn fault_missing_frontmatter_returns_rename_missing_frontmatter_and_rolls_back() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    // frontmatter 区切りなしの md（防御パス）
    write_md(dir.path(), "tasks/plain.md", "no frontmatter here\n");

    let state = Arc::new(AppState::new());
    let cfg: Config = serde_json::from_str(
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    )
    .unwrap();
    state.install_test_project(
        dir.path(),
        cfg,
        LabelRegistry::default(),
        MilestoneRegistry::default(),
        vec![task("tasks/a.md", "Todo"), task("tasks/plain.md", "Todo")],
    );

    let before_a = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    let before_plain = fs::read_to_string(dir.path().join("tasks/plain.md")).unwrap();

    let err = update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    match err {
        UpdateColumnsError::RenameMissingFrontmatter { path } => {
            assert!(path.ends_with("tasks/plain.md"));
        }
        other => panic!("expected RenameMissingFrontmatter, got {other:?}"),
    }

    // rollback により a.md は元に戻る
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).unwrap(),
        before_a
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/plain.md")).unwrap(),
        before_plain
    );
}

#[test]
fn e2e_combined_columns_renames_done_column_applied_in_order() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", "---\nstatus: Todo\n---\n");

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let final_cols = vec![
        Column {
            name: ColumnName::from_lenient("To Do"),
            order: 0,
            color: None,
        },
        Column {
            name: ColumnName::from_lenient("In Review"),
            order: 1,
            color: None,
        },
        Column {
            name: ColumnName::from_lenient("Done"),
            order: 2,
            color: None,
        },
    ];

    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            columns: Some(final_cols.clone()),
            done_column: Some("Done".into()),
            renames: Some(vec![rename("Todo", "To Do")]),
        },
    )
    .expect("ok");

    let on_disk = read_config_json(dir.path());
    assert_eq!(on_disk.columns, final_cols);
    assert_eq!(read_status(dir.path(), "tasks/a.md"), "To Do");
}

#[test]
fn e2e_guide_md_contains_renamed_column_name_after_update() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Doing", "order": 1 },
                { "name": "Done", "order": 2 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", "---\nstatus: Doing\n---\n");
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Doing", "In Progress")]),
            ..Default::default()
        },
    )
    .expect("ok");

    let guide = fs::read_to_string(dir.path().join(".spec-board/GUIDE.md")).unwrap();
    assert!(
        guide.contains("- In Progress"),
        "GUIDE.md must contain renamed column 'In Progress': {guide}"
    );
    assert!(
        !guide.contains("- Doing\n"),
        "GUIDE.md must not contain old column 'Doing': {guide}"
    );
}

#[test]
fn fault_write_ignore_lock_poisoned_returns_state_lock_poisoned() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(dir.path(), "tasks/a.md", "---\nstatus: Todo\n---\n");
    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let snapshot = state.require_session_snapshot().unwrap();
    state
        .resources_for(snapshot.version())
        .unwrap()
        .write_ignore()
        .poison_lock_for_testing();

    let err = update_columns_impl(
        &state,
        &FsTaskIo,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();
    assert!(matches!(err, UpdateColumnsError::StateLockPoisoned));
}

#[test]
fn fault_rewrite_fails_with_watcher_installed_clears_write_ignore_registry() {
    let dir = tempdir();
    write_initial_config(
        dir.path(),
        r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {},
            "doneColumn": "Done"
        }"#,
    );
    write_md(
        dir.path(),
        "tasks/a.md",
        "---\ntitle: A\nstatus: Todo\n---\nbody\n",
    );
    write_md(
        dir.path(),
        "tasks/b.md",
        "---\ntitle: B\nstatus: Todo\n---\nbody\n",
    );

    let state = Arc::new(AppState::new());
    open_with_noop(Arc::clone(&state), dir.path());

    let snapshot = state.require_session_snapshot().unwrap();
    let resources = state.resources_for(snapshot.version()).unwrap();

    let before_a = fs::read_to_string(dir.path().join("tasks/a.md")).unwrap();
    let before_b = fs::read_to_string(dir.path().join("tasks/b.md")).unwrap();

    let io = FailingTaskIo::new().fail_write_at_indices([1]);
    let err = update_columns_impl(
        &state,
        &io,
        &FsConfigWriter,
        UpdateColumnsArgs {
            renames: Some(vec![rename("Todo", "To Do")]),
            ..Default::default()
        },
    )
    .unwrap_err();

    assert!(matches!(err, UpdateColumnsError::RenameWriteFailed { .. }));

    assert!(
        resources.write_ignore().is_empty().unwrap(),
        "write_ignore registry must be empty after failed rename"
    );

    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/a.md")).unwrap(),
        before_a
    );
    assert_eq!(
        fs::read_to_string(dir.path().join("tasks/b.md")).unwrap(),
        before_b
    );

    let snap = state.test_tasks_snapshot().unwrap();
    assert_eq!(
        snap.len(),
        2,
        "expected 2 tasks in snapshot, got {}",
        snap.len()
    );
    let mut paths: Vec<String> = snap
        .iter()
        .map(|t| t.file_path.as_str().to_string())
        .collect();
    paths.sort();
    assert_eq!(
        paths,
        vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()],
    );
    for t in &snap {
        assert_eq!(t.status.as_str(), "Todo");
    }
}
