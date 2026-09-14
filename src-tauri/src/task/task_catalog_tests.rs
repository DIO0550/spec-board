use std::path::PathBuf;

use super::*;
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::task_index::{ParentHierarchyErrorReason, ParsedTaskBuilder, MAX_PARENT_DEPTH};
use crate::task::warning::TaskWarningCode;

fn candidate(path: &str, parent: Option<&str>) -> ParsedTask {
    let builder = ParsedTaskBuilder::new(path).title(path).status("todo");
    match parent {
        Some(parent) => builder.parent(Some(TaskFilePath::from(parent))).build(),
        None => builder.build(),
    }
}

#[test]
fn resolve_sorts_tasks_by_file_path() {
    let resolution = TaskCatalog::resolve(vec![candidate("b.md", None), candidate("a.md", None)])
        .expect("resolve");
    let paths: Vec<_> = resolution
        .catalog
        .iter()
        .map(|t| t.file_path().as_str())
        .collect();
    assert_eq!(paths, vec!["a.md", "b.md"]);
}

#[test]
fn resolve_rejects_the_later_duplicate_identity_and_keeps_the_first() {
    let resolution = TaskCatalog::resolve(vec![candidate("a.md", None), candidate("./a.md", None)])
        .expect("resolve");
    assert_eq!(resolution.catalog.len(), 1);
    // "./a.md" < "a.md" なので "./a.md" が先勝ち
    assert_eq!(resolution.duplicates.len(), 1);
    assert_eq!(resolution.duplicates[0].kept.as_str(), "./a.md");
    assert_eq!(resolution.duplicates[0].rejected.as_str(), "a.md");
    assert_eq!(resolution.duplicates[0].identity.as_str(), "a.md");
    assert_eq!(
        resolution
            .catalog
            .get(&CanonicalTaskPath::new("a.md"))
            .map(|t| t.file_path().as_str()),
        Some("./a.md")
    );
}

fn candidate_with_links(path: &str, links: &[&str]) -> ParsedTask {
    ParsedTaskBuilder::new(path)
        .title(path)
        .status("todo")
        .links(links.iter().map(|link| TaskFilePath::from(*link)).collect())
        .build()
}

/// `tasks/0.md` を末端として `edge_count` 本の parent edge を持つ chain を作る。
fn parent_chain_with_edge_count(edge_count: usize) -> Vec<ParsedTask> {
    (0..=edge_count)
        .map(|i| {
            let parent = (i < edge_count).then(|| format!("tasks/{}.md", i + 1));
            candidate(&format!("tasks/{i}.md"), parent.as_deref())
        })
        .collect()
}

#[test]
fn resolve_keeps_the_first_in_input_order_when_file_paths_are_identical() {
    let first = ParsedTaskBuilder::new("tasks/a.md").title("first").build();
    let second = ParsedTaskBuilder::new("tasks/a.md").title("second").build();

    let resolution = TaskCatalog::resolve(vec![first, second]).expect("resolve");

    assert_eq!(resolution.catalog.len(), 1);
    assert_eq!(
        resolution
            .catalog
            .get(&CanonicalTaskPath::new("tasks/a.md"))
            .expect("kept")
            .title()
            .as_str(),
        "first",
        "同じ file_path 文字列は stable sort で入力順を保ち、先頭を採る"
    );
    assert_eq!(resolution.duplicates.len(), 1);
}

#[test]
fn get_resolves_notation_variants_to_the_same_task() {
    let resolution = TaskCatalog::resolve(vec![candidate("tasks/a.md", None)]).expect("resolve");
    let catalog = resolution.catalog;
    assert!(catalog
        .get(&CanonicalTaskPath::new("./tasks/a.md"))
        .is_some());
    assert!(catalog
        .get(&CanonicalTaskPath::new("tasks\\a.md"))
        .is_some());
    assert!(catalog.contains(&CanonicalTaskPath::new("tasks/a.md")));
    assert!(!catalog.contains(&CanonicalTaskPath::new("tasks/b.md")));
}

#[test]
fn resolve_builds_children_and_reverse_links_consistently() {
    let resolution = TaskCatalog::resolve(vec![
        candidate("parent.md", None),
        candidate("child.md", Some("parent.md")),
        candidate_with_links("source.md", &["parent.md"]),
    ])
    .expect("resolve");
    let parent = resolution
        .catalog
        .get(&CanonicalTaskPath::new("parent.md"))
        .expect("parent");
    assert_eq!(parent.children(), &[TaskFilePath::from("child.md")]);
    assert_eq!(parent.reverse_links(), &[TaskFilePath::from("source.md")]);
    let child = resolution
        .catalog
        .get(&CanonicalTaskPath::new("child.md"))
        .expect("child");
    assert_eq!(child.parent(), Some(&TaskFilePath::from("parent.md")));
}

#[test]
fn resolve_reports_parent_cycle_as_warning_not_error() {
    let resolution = TaskCatalog::resolve(vec![
        candidate("a.md", Some("b.md")),
        candidate("b.md", Some("a.md")),
    ])
    .expect("cycle は Err にならない");
    assert_eq!(resolution.catalog.len(), 2);
    for task in resolution.catalog.iter() {
        assert!(
            task.warnings()
                .iter()
                .any(|w| w.code == TaskWarningCode::ParentCycle),
            "{} は parentCycle warning を持つ",
            task.file_path().as_str()
        );
        assert_eq!(
            task.parent(),
            None,
            "cycle member の effective parent は None"
        );
    }
}

#[test]
fn resolve_fails_only_when_the_parent_chain_is_too_deep() {
    let at_limit = TaskCatalog::resolve(parent_chain_with_edge_count(MAX_PARENT_DEPTH));
    assert!(at_limit.is_ok(), "MAX_PARENT_DEPTH 段までは Ok");

    let over_limit = TaskCatalog::resolve(parent_chain_with_edge_count(MAX_PARENT_DEPTH + 1));
    assert!(matches!(
        over_limit,
        Err(TaskParseError::CycleOrTooDeep {
            reason: ParentHierarchyErrorReason::TooDeep,
            ..
        })
    ));
}

#[test]
fn resolve_with_no_candidates_yields_an_empty_catalog() {
    let resolution = TaskCatalog::resolve(Vec::new()).expect("resolve");
    assert!(resolution.catalog.is_empty());
    assert_eq!(resolution.catalog.len(), 0);
    assert!(resolution.duplicates.is_empty());
    assert_eq!(resolution.catalog, TaskCatalog::default());
}

#[test]
fn task_payload_id_equals_file_path_for_every_task() {
    let resolution = TaskCatalog::resolve(vec![candidate("x/a.md", None), candidate("b.md", None)])
        .expect("resolve");
    for task in resolution.catalog.iter() {
        let payload = crate::task::payload::TaskPayload::from(task.clone());
        assert_eq!(payload.id, payload.file_path);
    }
}

#[test]
fn to_index_exposes_every_task_in_catalog_order() {
    let resolution = TaskCatalog::resolve(vec![
        candidate("c.md", None),
        candidate("b.md", None),
        candidate("a.md", None),
    ])
    .expect("resolve");
    assert_eq!(
        resolution.catalog.to_index().as_slice(),
        resolution.catalog.as_slice()
    );
}

#[test]
fn apply_reports_created_for_a_new_identity_and_updated_for_an_existing_one() {
    let catalog = TaskCatalog::resolve(vec![candidate("a.md", None)])
        .expect("resolve")
        .catalog;

    let created = catalog
        .apply(TaskChange::Upserted(Box::new(candidate("b.md", None))))
        .expect("apply");
    assert_eq!(
        created.outcome_of(&CanonicalTaskPath::new("b.md")),
        Some(&AppliedTaskChange::Created(CanonicalTaskPath::new("b.md")))
    );
    assert_eq!(created.next().len(), 2);

    let updated = catalog
        .apply(TaskChange::Upserted(Box::new(candidate("a.md", None))))
        .expect("apply");
    assert_eq!(
        updated.outcome_of(&CanonicalTaskPath::new("a.md")),
        Some(&AppliedTaskChange::Updated(CanonicalTaskPath::new("a.md")))
    );
    assert_eq!(updated.next().len(), 1);
}

#[test]
fn apply_reports_absent_on_remove_when_the_identity_is_missing() {
    let catalog = TaskCatalog::resolve(vec![candidate("a.md", None)])
        .expect("resolve")
        .catalog;

    let set = catalog
        .apply(TaskChange::Removed(TaskFilePath::from("zzz.md")))
        .expect("apply");

    assert_eq!(
        set.outcome_of(&CanonicalTaskPath::new("zzz.md")),
        Some(&AppliedTaskChange::AbsentOnRemove(CanonicalTaskPath::new(
            "zzz.md"
        )))
    );
    assert!(set.affected().is_empty());
    assert!(set.removed().is_empty());
    assert_eq!(set.next(), &catalog);
}

// ---------------------------------------------------------------------------
// 旧 `TaskIndex::rebuild_with_external_change` から移設した派生値再構築のテスト。
// 変更対象だけでなく全 task の派生値（children / reverse_links / warning）が
// 作り直されることを固定する。
// ---------------------------------------------------------------------------

/// frontmatter の parent / links を指定した parse-only candidate を markdown 経由で作る。
fn task_with(file_path: &str, parent: Option<&str>, links: &[&str]) -> ParsedTask {
    let mut markdown = String::from("---\ntitle: Task\nstatus: Todo\n");
    if let Some(parent) = parent {
        markdown.push_str(&format!("parent: {parent}\n"));
    }
    if !links.is_empty() {
        markdown.push_str("links:\n");
        for link in links {
            markdown.push_str(&format!("  - {link}\n"));
        }
    }
    markdown.push_str("---\n");
    let context = TaskParseContext {
        file_path: PathBuf::from(file_path),
        default_status: "Todo".into(),
    };
    task_from_markdown(markdown.as_bytes(), &context).expect("fixture markdown parses")
}

fn catalog_of(candidates: Vec<ParsedTask>) -> TaskCatalog {
    TaskCatalog::resolve(candidates)
        .expect("fixture candidates resolve")
        .catalog
}

fn task_by_path<'a>(catalog: &'a TaskCatalog, file_path: &str) -> &'a Task {
    catalog
        .get(&CanonicalTaskPath::new(file_path))
        .unwrap_or_else(|| panic!("{file_path} must be present"))
}

fn removed(file_path: &str) -> TaskChange {
    TaskChange::Removed(TaskFilePath::from(file_path))
}

fn upserted(candidate: ParsedTask) -> TaskChange {
    TaskChange::Upserted(Box::new(candidate))
}

fn has_warning(task: &Task, code: TaskWarningCode) -> bool {
    task.warnings().iter().any(|warning| warning.code == code)
}

fn paths_of(catalog: &TaskCatalog) -> Vec<&str> {
    catalog
        .iter()
        .map(|task| task.file_path().as_str())
        .collect()
}

fn key(file_path: &str) -> CanonicalTaskPath {
    CanonicalTaskPath::new(file_path)
}

#[test]
fn reparenting_moves_the_child_between_the_two_parents() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", None, &[]),
        task_with("tasks/c.md", None, &[]),
    ]);

    let set = catalog
        .apply(upserted(task_with("tasks/a.md", Some("tasks/c.md"), &[])))
        .expect("reparenting must not fail");

    assert!(
        task_by_path(set.next(), "tasks/b.md").children().is_empty(),
        "旧親の children から子が消える"
    );
    assert_eq!(
        task_by_path(set.next(), "tasks/c.md").children().len(),
        1,
        "新親の children に子が入る"
    );
    assert!(
        set.touches_other_than(&[key("tasks/a.md")]),
        "変更対象以外（旧親・新親）も変わっている"
    );
}

#[test]
fn body_only_upsert_leaves_the_other_tasks_untouched() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/b.md", None, &[]),
    ]);
    let mut edited = task_with("tasks/a.md", None, &[]);
    edited.body = "更新後の本文".to_string();

    let set = catalog
        .apply(upserted(edited))
        .expect("body edit must not fail");

    assert_eq!(
        set.task(&key("tasks/a.md"))
            .expect("changed task present")
            .body(),
        "更新後の本文"
    );
    assert!(
        !set.touches_other_than(&[key("tasks/a.md")]),
        "孤立タスクの本文変更は他タスクに波及しない"
    );
}

#[test]
fn adding_a_link_grows_the_reverse_links_of_the_target() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/d.md", None, &[]),
    ]);

    let set = catalog
        .apply(upserted(task_with("tasks/a.md", None, &["tasks/d.md"])))
        .expect("adding a link must not fail");

    assert_eq!(
        task_by_path(set.next(), "tasks/d.md").reverse_links(),
        vec![TaskFilePath::from("tasks/a.md")],
    );
    assert!(set.touches_other_than(&[key("tasks/a.md")]));
}

#[test]
fn removing_a_link_shrinks_the_reverse_links_of_the_target() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", None, &["tasks/d.md"]),
        task_with("tasks/d.md", None, &[]),
    ]);

    let set = catalog
        .apply(upserted(task_with("tasks/a.md", None, &[])))
        .expect("removing a link must not fail");

    assert!(task_by_path(set.next(), "tasks/d.md")
        .reverse_links()
        .is_empty());
    assert!(set.touches_other_than(&[key("tasks/a.md")]));
}

#[test]
fn upserting_an_unknown_path_adds_the_task() {
    let catalog = catalog_of(vec![task_with("tasks/b.md", None, &[])]);

    let set = catalog
        .apply(upserted(task_with("tasks/a.md", Some("tasks/b.md"), &[])))
        .expect("adding a task must not fail");

    assert_eq!(set.next().len(), 2);
    assert_eq!(
        task_by_path(set.next(), "tasks/b.md").children(),
        vec![TaskFilePath::from("tasks/a.md")],
    );
}

#[test]
fn removing_a_referenced_task_shrinks_the_derived_values_of_the_referrer() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", None, &[]),
    ]);

    let set = catalog
        .apply(removed("tasks/a.md"))
        .expect("removal must not fail");

    assert_eq!(paths_of(set.next()), vec!["tasks/b.md"]);
    assert!(task_by_path(set.next(), "tasks/b.md").children().is_empty());
    assert!(
        set.task(&key("tasks/a.md")).is_none(),
        "削除では対象 task は残らない"
    );
    assert_eq!(set.removed(), &[key("tasks/a.md")]);
    assert!(set.touches_other_than(&[key("tasks/a.md")]));
}

#[test]
fn removing_an_unreferenced_task_leaves_the_other_tasks_untouched() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/b.md", None, &[]),
    ]);

    let set = catalog
        .apply(removed("tasks/a.md"))
        .expect("removal must not fail");

    assert!(set.affected().is_empty());
    assert!(
        !set.touches_other_than(&[key("tasks/a.md")]),
        "誰からも参照されない task の削除は波及しない"
    );
}

#[test]
fn upserting_into_an_empty_catalog_adds_the_only_task() {
    let set = TaskCatalog::default()
        .apply(upserted(task_with("tasks/a.md", None, &[])))
        .expect("upsert into empty catalog must not fail");

    assert_eq!(set.next().len(), 1);
    assert_eq!(set.affected().len(), 1);
    assert!(!set.touches_other_than(&[key("tasks/a.md")]));
}

#[test]
fn removing_the_only_task_empties_the_catalog() {
    let set = catalog_of(vec![task_with("tasks/a.md", None, &[])])
        .apply(removed("tasks/a.md"))
        .expect("removing the only task must not fail");

    assert!(set.next().is_empty());
    assert!(!set.touches_other_than(&[key("tasks/a.md")]));
}

#[test]
fn the_rebuilt_tasks_are_sorted_by_file_path() {
    let catalog = catalog_of(vec![
        task_with("tasks/c.md", Some("tasks/b.md"), &["tasks/b.md"]),
        task_with("tasks/b.md", None, &[]),
    ]);

    let set = catalog
        .apply(upserted(task_with(
            "tasks/a.md",
            Some("tasks/b.md"),
            &["tasks/b.md"],
        )))
        .expect("upsert must not fail");

    assert_eq!(
        paths_of(set.next()),
        vec!["tasks/a.md", "tasks/b.md", "tasks/c.md"],
        "入力順ではなく file_path 昇順で返す"
    );
    assert_eq!(
        task_by_path(set.next(), "tasks/b.md").children(),
        vec![
            TaskFilePath::from("tasks/a.md"),
            TaskFilePath::from("tasks/c.md"),
        ],
        "children の並びも入力順に依存しない"
    );
    assert_eq!(
        task_by_path(set.next(), "tasks/b.md").reverse_links(),
        vec![
            TaskFilePath::from("tasks/a.md"),
            TaskFilePath::from("tasks/c.md"),
        ],
        "reverse_links の並びも入力順に依存しない"
    );
}

#[test]
fn creating_a_cycle_yields_warnings_instead_of_an_error() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", None, &[]),
    ]);

    let set = catalog
        .apply(upserted(task_with("tasks/b.md", Some("tasks/a.md"), &[])))
        .expect("外部編集で循環ができてもイベント処理は止まらない");

    for path in ["tasks/a.md", "tasks/b.md"] {
        let task = task_by_path(set.next(), path);
        assert!(task.parent().is_none(), "{path} の parent は None 化される");
        assert!(
            has_warning(task, TaskWarningCode::ParentCycle),
            "{path} に parentCycle warning が付く"
        );
    }
}

#[test]
fn breaking_a_cycle_clears_the_warnings() {
    let cyclic = catalog_of(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", Some("tasks/a.md"), &[]),
    ]);

    let set = cyclic
        .apply(upserted(task_with("tasks/a.md", None, &[])))
        .expect("breaking a cycle must not fail");

    for path in ["tasks/a.md", "tasks/b.md"] {
        assert!(
            !has_warning(task_by_path(set.next(), path), TaskWarningCode::ParentCycle),
            "{path} の parentCycle warning は消える"
        );
    }
}

#[test]
fn creating_the_missing_parent_clears_the_stale_warning() {
    let catalog = catalog_of(vec![task_with("tasks/a.md", Some("tasks/b.md"), &[])]);
    assert!(
        has_warning(
            task_by_path(&catalog, "tasks/a.md"),
            TaskWarningCode::ParentNotFound
        ),
        "前提: 親が居ないので warning が付いている"
    );

    let set = catalog
        .apply(upserted(task_with("tasks/b.md", None, &[])))
        .expect("creating the parent must not fail");

    assert!(
        !has_warning(
            task_by_path(set.next(), "tasks/a.md"),
            TaskWarningCode::ParentNotFound
        ),
        "親が作られたら parentNotFound warning は消える"
    );
    assert!(
        set.touches_other_than(&[key("tasks/b.md")]),
        "warning が消えた参照元も変化として数える"
    );
}

#[test]
fn a_missing_parent_keeps_the_raw_value_and_adds_a_warning() {
    let catalog = catalog_of(vec![task_with("tasks/a.md", None, &[])]);

    let set = catalog
        .apply(upserted(task_with(
            "tasks/a.md",
            Some("tasks/missing.md"),
            &[],
        )))
        .expect("a missing parent must not fail");

    let task = task_by_path(set.next(), "tasks/a.md");
    assert_eq!(
        task.parent().map(TaskFilePath::as_str),
        Some("tasks/missing.md"),
        "frontmatter の raw 値は書き換えない"
    );
    assert!(has_warning(task, TaskWarningCode::ParentNotFound));
}

#[test]
fn links_to_a_removed_task_are_kept_as_raw_values() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", None, &["tasks/d.md"]),
        task_with("tasks/d.md", None, &[]),
    ]);

    let set = catalog
        .apply(removed("tasks/d.md"))
        .expect("removal must not fail");

    let referrer = task_by_path(set.next(), "tasks/a.md");
    assert_eq!(
        referrer.links(),
        vec![TaskFilePath::from("tasks/d.md")],
        "消えた task への links は値として残る"
    );
    assert!(referrer.reverse_links().is_empty());
}

#[test]
fn a_path_spelled_differently_replaces_the_existing_slot() {
    let catalog = catalog_of(vec![task_with("tasks/a.md", None, &[])]);

    let set = catalog
        .apply(upserted(task_with("./tasks/a.md", None, &[])))
        .expect("upsert must not fail");

    assert_eq!(set.next().len(), 1, "表記揺れがあっても slot は重複しない");
    assert_eq!(
        set.outcome_of(&key("tasks/a.md")),
        Some(&AppliedTaskChange::Updated(key("tasks/a.md"))),
        "表記揺れは既存 identity の更新として扱う"
    );
}

#[test]
fn a_parent_chain_deeper_than_the_limit_is_rejected() {
    let catalog = catalog_of(parent_chain_with_edge_count(MAX_PARENT_DEPTH));

    // 末端の下にもう 1 段ぶら下げると chain が MAX_PARENT_DEPTH + 1 段になる。
    let result = catalog.apply(upserted(candidate("tasks/leaf.md", Some("tasks/0.md"))));

    assert!(
        result.is_err(),
        "深すぎる親チェーンは Err にして呼び出し側が catalog を不変にできるようにする"
    );
}

#[test]
fn apply_all_applies_changes_in_order_and_the_last_upsert_wins() {
    let catalog = TaskCatalog::default();
    let first = ParsedTaskBuilder::new("a.md").title("first").build();
    let second = ParsedTaskBuilder::new("a.md").title("second").build();

    let set = catalog
        .apply_all(vec![upserted(first), upserted(second)])
        .expect("apply_all");

    assert_eq!(
        set.applied(),
        &[
            AppliedTaskChange::Created(key("a.md")),
            AppliedTaskChange::Updated(key("a.md")),
        ]
    );
    assert_eq!(
        set.task(&key("a.md"))
            .expect("a.md exists")
            .title()
            .as_str(),
        "second"
    );
    assert_eq!(set.next().len(), 1);
}

#[test]
fn apply_all_with_remove_then_upsert_recreates_the_task() {
    let catalog = catalog_of(vec![
        candidate("a.md", None),
        candidate("c.md", Some("a.md")),
    ]);

    let set = catalog
        .apply_all(vec![removed("a.md"), upserted(candidate("b.md", None))])
        .expect("apply_all");

    assert_eq!(set.removed(), &[key("a.md")]);
    assert_eq!(
        set.applied(),
        &[
            AppliedTaskChange::Removed(key("a.md")),
            AppliedTaskChange::Created(key("b.md")),
        ]
    );
    assert_eq!(paths_of(set.next()), vec!["b.md", "c.md"]);
    // rename 元を親にしていた c.md は parentNotFound へ倒れるので affected に入る。
    let affected: Vec<_> = set
        .affected()
        .iter()
        .map(|task| task.file_path().as_str())
        .collect();
    assert_eq!(affected, vec!["b.md", "c.md"]);
}

#[test]
fn apply_all_renames_statuses_of_many_tasks_in_one_rebuild() {
    let catalog = catalog_of(
        (0..5)
            .map(|i| candidate(&format!("t{i}.md"), None))
            .collect(),
    );
    let changes = ["t0.md", "t2.md", "t4.md"]
        .iter()
        .map(|path| {
            upserted(
                catalog
                    .get(&key(path))
                    .expect("fixture task")
                    .with_status_candidate("doing"),
            )
        })
        .collect();

    let set = catalog.apply_all(changes).expect("apply_all");

    let affected: Vec<_> = set
        .affected()
        .iter()
        .map(|task| task.file_path().as_str())
        .collect();
    assert_eq!(affected, vec!["t0.md", "t2.md", "t4.md"]);
    for path in ["t1.md", "t3.md"] {
        assert_eq!(
            set.task(&key(path)),
            catalog.get(&key(path)),
            "{path} は変更前と同じ値のまま"
        );
    }
    assert!(set.removed().is_empty());
    assert_eq!(set.applied().len(), 3);
}

#[test]
fn change_set_affected_and_removed_are_sorted_and_deterministic() {
    let catalog = catalog_of(vec![
        task_with("tasks/z.md", Some("tasks/m.md"), &[]),
        task_with("tasks/m.md", None, &[]),
        task_with("tasks/a.md", None, &["tasks/z.md"]),
        task_with("tasks/q.md", None, &[]),
    ]);
    let changes = || {
        vec![
            removed("tasks/q.md"),
            upserted(task_with("tasks/z.md", Some("tasks/a.md"), &[])),
            removed("tasks/m.md"),
        ]
    };

    let first = catalog.apply_all(changes()).expect("first apply_all");
    let second = catalog.apply_all(changes()).expect("second apply_all");

    assert_eq!(first.applied(), second.applied());
    assert_eq!(first.affected(), second.affected());
    assert_eq!(first.removed(), second.removed());
    assert_eq!(first.next(), second.next());
    let affected: Vec<_> = first
        .affected()
        .iter()
        .map(|task| task.file_path().as_str())
        .collect();
    assert_eq!(
        affected,
        vec!["tasks/a.md", "tasks/z.md"],
        "affected は昇順"
    );
    assert_eq!(
        first.removed(),
        &[key("tasks/m.md"), key("tasks/q.md")],
        "removed は入力順ではなく昇順"
    );
}

#[test]
fn touches_other_than_is_false_when_only_the_target_changed() {
    let catalog = catalog_of(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/b.md", None, &[]),
    ]);
    let mut edited = task_with("tasks/a.md", None, &[]);
    edited.body = "edited".to_string();

    let set = catalog.apply(upserted(edited)).expect("apply");

    assert_eq!(set.affected().len(), 1);
    assert!(!set.touches_other_than(&[key("tasks/a.md")]));
    assert!(
        set.touches_other_than(&[key("tasks/b.md")]),
        "target に含めなければ a.md 自身が「他」になる"
    );
}

#[test]
fn touches_other_than_is_true_when_a_referrer_changed() {
    let catalog = catalog_of(vec![
        task_with("tasks/child.md", Some("tasks/old.md"), &[]),
        task_with("tasks/old.md", None, &[]),
        task_with("tasks/new.md", None, &[]),
    ]);

    let set = catalog
        .apply(upserted(task_with(
            "tasks/child.md",
            Some("tasks/new.md"),
            &[],
        )))
        .expect("apply");

    let affected: Vec<_> = set
        .affected()
        .iter()
        .map(|task| task.file_path().as_str())
        .collect();
    assert_eq!(
        affected,
        vec!["tasks/child.md", "tasks/new.md", "tasks/old.md"]
    );
    assert!(set.touches_other_than(&[key("tasks/child.md")]));
    assert!(!set.touches_other_than(&[
        key("tasks/child.md"),
        key("tasks/new.md"),
        key("tasks/old.md"),
    ]));
}

#[test]
fn every_task_in_next_satisfies_the_catalog_invariants() {
    let catalog = catalog_of(vec![
        task_with("tasks/c.md", Some("tasks/a.md"), &[]),
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/b.md", Some("tasks/a.md"), &["tasks/c.md"]),
    ]);

    let set = catalog
        .apply_all(vec![
            upserted(task_with("tasks/d.md", Some("tasks/a.md"), &[])),
            removed("tasks/c.md"),
            upserted(task_with("./tasks/b.md", Some("tasks/d.md"), &[])),
        ])
        .expect("apply_all");
    let next = set.next();

    assert_eq!(next.index.len(), next.tasks.len(), "identity は一意");
    for (position, task) in next.tasks.iter().enumerate() {
        assert_eq!(
            next.index
                .get(&CanonicalTaskPath::from_file_path(task.file_path())),
            Some(&position),
            "index は tasks の添字と一致する"
        );
    }
    let paths = paths_of(next);
    let mut sorted = paths.clone();
    sorted.sort_unstable();
    assert_eq!(paths, sorted, "file_path 昇順");
    for task in next.iter() {
        let identity = CanonicalTaskPath::from_file_path(task.file_path());
        let mut expected_children: Vec<_> = next
            .iter()
            .filter(|other| {
                other
                    .parent()
                    .is_some_and(|parent| CanonicalTaskPath::from_file_path(parent) == identity)
            })
            .map(|other| other.file_path().clone())
            .collect();
        expected_children.sort_by(|left, right| left.as_str().cmp(right.as_str()));
        assert_eq!(
            task.children(),
            expected_children.as_slice(),
            "{} の children は parent がそれを指す task の集合（昇順）",
            task.file_path().as_str()
        );
    }
}
