//! `TaskIndex::rebuild_with_external_change` の単体テスト。
//!
//! watcher が観測した外部変更 1 件を適用したとき、変更対象だけでなく全タスクの
//! 派生値（`children` / `reverse_links` / warning）が作り直されることを、adapter を
//! 通さずに固定する。

use std::path::PathBuf;

use super::{ExternalTaskChange, Task, TaskIndex};
use crate::task::parse::{task_from_markdown, TaskParseContext};
use crate::task::task_file_path::TaskFilePath;
use crate::task::warning::TaskWarningCode;

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

/// parent / links を指定した最小の Task を作る。
fn task_with(file_path: &str, parent: Option<&str>, links: &[&str]) -> Task {
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
    crate::task::task_index::resolve_parsed_for_test(
        task_from_markdown(markdown.as_bytes(), &context(file_path)).unwrap(),
    )
}

/// 指定 path の task を outcome から引き当てる。
fn task_by_path<'a>(tasks: &'a [Task], file_path: &str) -> &'a Task {
    tasks
        .iter()
        .find(|task| task.file_path == file_path)
        .unwrap_or_else(|| panic!("{file_path} must be present"))
}

fn removed(file_path: &str) -> ExternalTaskChange {
    ExternalTaskChange::Removed(TaskFilePath::from(file_path.to_string()))
}

fn upserted(task: Task) -> ExternalTaskChange {
    ExternalTaskChange::Upserted(Box::new(task.to_parsed_task()))
}

fn has_warning(task: &Task, code: TaskWarningCode) -> bool {
    task.warnings().iter().any(|warning| warning.code == code)
}

fn paths_of(tasks: &[Task]) -> Vec<&str> {
    tasks.iter().map(|task| task.file_path.as_str()).collect()
}

#[test]
fn reparenting_moves_the_child_between_the_two_parents() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", None, &[]),
        task_with("tasks/c.md", None, &[]),
    ]);

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("tasks/a.md", Some("tasks/c.md"), &[])))
        .expect("reparenting must not fail");

    assert!(
        task_by_path(&outcome.tasks, "tasks/b.md")
            .children()
            .is_empty(),
        "旧親の children から子が消える"
    );
    assert_eq!(
        task_by_path(&outcome.tasks, "tasks/c.md").children().len(),
        1,
        "新親の children に子が入る"
    );
    assert!(
        outcome.other_tasks_changed,
        "変更対象以外（旧親・新親）も変わっている"
    );
}

#[test]
fn body_only_upsert_leaves_the_other_tasks_untouched() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/b.md", None, &[]),
    ]);

    let mut edited = task_with("tasks/a.md", None, &[]).to_parsed_task();
    edited.body = "更新後の本文".to_string();

    let outcome = index
        .rebuild_with_external_change(ExternalTaskChange::Upserted(Box::new(edited)))
        .expect("body edit must not fail");

    assert_eq!(
        outcome
            .changed_task
            .as_ref()
            .expect("changed task present")
            .body,
        "更新後の本文"
    );
    assert!(
        !outcome.other_tasks_changed,
        "孤立タスクの本文変更は他タスクに波及しない"
    );
}

#[test]
fn adding_a_link_grows_the_reverse_links_of_the_target() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/d.md", None, &[]),
    ]);

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("tasks/a.md", None, &["tasks/d.md"])))
        .expect("adding a link must not fail");

    assert_eq!(
        task_by_path(&outcome.tasks, "tasks/d.md").reverse_links(),
        vec![TaskFilePath::from("tasks/a.md")],
    );
    assert!(outcome.other_tasks_changed);
}

#[test]
fn removing_a_link_shrinks_the_reverse_links_of_the_target() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", None, &["tasks/d.md"]),
        task_with("tasks/d.md", None, &[]),
    ])
    .rebuild_derived_with_warnings()
    .expect("initial derive");

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("tasks/a.md", None, &[])))
        .expect("removing a link must not fail");

    assert!(task_by_path(&outcome.tasks, "tasks/d.md")
        .reverse_links()
        .is_empty());
    assert!(outcome.other_tasks_changed);
}

#[test]
fn upserting_an_unknown_path_adds_the_task() {
    let index = TaskIndex::new(vec![task_with("tasks/b.md", None, &[])]);

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("tasks/a.md", Some("tasks/b.md"), &[])))
        .expect("adding a task must not fail");

    assert_eq!(outcome.tasks.len(), 2);
    assert_eq!(
        task_by_path(&outcome.tasks, "tasks/b.md").children(),
        vec![TaskFilePath::from("tasks/a.md")],
    );
}

#[test]
fn removing_a_referenced_task_shrinks_the_derived_values_of_the_referrer() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", None, &[]),
    ])
    .rebuild_derived_with_warnings()
    .expect("initial derive");

    let outcome = index
        .rebuild_with_external_change(removed("tasks/a.md"))
        .expect("removal must not fail");

    assert_eq!(paths_of(&outcome.tasks), vec!["tasks/b.md"]);
    assert!(task_by_path(&outcome.tasks, "tasks/b.md")
        .children()
        .is_empty());
    assert!(
        outcome.changed_task.is_none(),
        "削除では対象 task は残らない"
    );
    assert!(outcome.other_tasks_changed);
}

#[test]
fn removing_an_unreferenced_task_leaves_the_other_tasks_untouched() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", None, &[]),
        task_with("tasks/b.md", None, &[]),
    ])
    .rebuild_derived_with_warnings()
    .expect("initial derive");

    let outcome = index
        .rebuild_with_external_change(removed("tasks/a.md"))
        .expect("removal must not fail");

    assert!(
        !outcome.other_tasks_changed,
        "誰からも参照されない task の削除は波及しない"
    );
}

#[test]
fn upserting_into_an_empty_index_adds_the_only_task() {
    let outcome = TaskIndex::new(Vec::new())
        .rebuild_with_external_change(upserted(task_with("tasks/a.md", None, &[])))
        .expect("upsert into empty index must not fail");

    assert_eq!(outcome.tasks.len(), 1);
    assert!(!outcome.other_tasks_changed);
}

#[test]
fn removing_the_only_task_empties_the_index() {
    let outcome = TaskIndex::new(vec![task_with("tasks/a.md", None, &[])])
        .rebuild_with_external_change(removed("tasks/a.md"))
        .expect("removing the only task must not fail");

    assert!(outcome.tasks.is_empty());
    assert!(!outcome.other_tasks_changed);
}

#[test]
fn the_rebuilt_tasks_are_sorted_by_file_path() {
    let index = TaskIndex::new(vec![
        task_with("tasks/c.md", Some("tasks/b.md"), &["tasks/b.md"]),
        task_with("tasks/b.md", None, &[]),
    ]);

    let outcome = index
        .rebuild_with_external_change(upserted(task_with(
            "tasks/a.md",
            Some("tasks/b.md"),
            &["tasks/b.md"],
        )))
        .expect("upsert must not fail");

    assert_eq!(
        paths_of(&outcome.tasks),
        vec!["tasks/a.md", "tasks/b.md", "tasks/c.md"],
        "入力 Vec の順ではなく file_path 昇順で返す"
    );
    assert_eq!(
        task_by_path(&outcome.tasks, "tasks/b.md").children(),
        vec![
            TaskFilePath::from("tasks/a.md"),
            TaskFilePath::from("tasks/c.md"),
        ],
        "children の並びも入力順に依存しない"
    );
    assert_eq!(
        task_by_path(&outcome.tasks, "tasks/b.md").reverse_links(),
        vec![
            TaskFilePath::from("tasks/a.md"),
            TaskFilePath::from("tasks/c.md"),
        ],
        "reverse_links の並びも入力順に依存しない"
    );
}

#[test]
fn creating_a_cycle_yields_warnings_instead_of_an_error() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", None, &[]),
    ])
    .rebuild_derived_with_warnings()
    .expect("initial derive");

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("tasks/b.md", Some("tasks/a.md"), &[])))
        .expect("外部編集で循環ができてもイベント処理は止まらない");

    for path in ["tasks/a.md", "tasks/b.md"] {
        let task = task_by_path(&outcome.tasks, path);
        assert!(task.parent().is_none(), "{path} の parent は None 化される");
        assert!(
            has_warning(task, TaskWarningCode::ParentCycle),
            "{path} に parentCycle warning が付く"
        );
    }
}

#[test]
fn breaking_a_cycle_clears_the_warnings() {
    let cyclic = TaskIndex::new(vec![
        task_with("tasks/a.md", Some("tasks/b.md"), &[]),
        task_with("tasks/b.md", Some("tasks/a.md"), &[]),
    ])
    .rebuild_derived_with_warnings()
    .expect("initial derive");

    let outcome = cyclic
        .rebuild_with_external_change(upserted(task_with("tasks/a.md", None, &[])))
        .expect("breaking a cycle must not fail");

    for path in ["tasks/a.md", "tasks/b.md"] {
        assert!(
            !has_warning(
                task_by_path(&outcome.tasks, path),
                TaskWarningCode::ParentCycle
            ),
            "{path} の parentCycle warning は消える"
        );
    }
}

#[test]
fn creating_the_missing_parent_clears_the_stale_warning() {
    let index = TaskIndex::new(vec![task_with("tasks/a.md", Some("tasks/b.md"), &[])])
        .rebuild_derived_with_warnings()
        .expect("initial derive");
    assert!(
        has_warning(
            task_by_path(index.as_slice(), "tasks/a.md"),
            TaskWarningCode::ParentNotFound
        ),
        "前提: 親が居ないので warning が付いている"
    );

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("tasks/b.md", None, &[])))
        .expect("creating the parent must not fail");

    assert!(
        !has_warning(
            task_by_path(&outcome.tasks, "tasks/a.md"),
            TaskWarningCode::ParentNotFound
        ),
        "親が作られたら parentNotFound warning は消える"
    );
    assert!(
        outcome.other_tasks_changed,
        "warning が消えた参照元も変化として数える"
    );
}

#[test]
fn a_missing_parent_keeps_the_raw_value_and_adds_a_warning() {
    let index = TaskIndex::new(vec![task_with("tasks/a.md", None, &[])]);

    let outcome = index
        .rebuild_with_external_change(upserted(task_with(
            "tasks/a.md",
            Some("tasks/missing.md"),
            &[],
        )))
        .expect("a missing parent must not fail");

    let task = task_by_path(&outcome.tasks, "tasks/a.md");
    assert_eq!(
        task.parent().map(TaskFilePath::as_str),
        Some("tasks/missing.md"),
        "frontmatter の raw 値は書き換えない"
    );
    assert!(has_warning(task, TaskWarningCode::ParentNotFound));
}

#[test]
fn links_to_a_removed_task_are_kept_as_raw_values() {
    let index = TaskIndex::new(vec![
        task_with("tasks/a.md", None, &["tasks/d.md"]),
        task_with("tasks/d.md", None, &[]),
    ])
    .rebuild_derived_with_warnings()
    .expect("initial derive");

    let outcome = index
        .rebuild_with_external_change(removed("tasks/d.md"))
        .expect("removal must not fail");

    let referrer = task_by_path(&outcome.tasks, "tasks/a.md");
    assert_eq!(
        referrer.links,
        vec![TaskFilePath::from("tasks/d.md")],
        "消えた task への links は値として残る"
    );
    assert!(referrer.reverse_links().is_empty());
}

#[test]
fn a_path_spelled_differently_replaces_the_existing_slot() {
    let index = TaskIndex::new(vec![task_with("tasks/a.md", None, &[])]);

    let outcome = index
        .rebuild_with_external_change(upserted(task_with("./tasks/a.md", None, &[])))
        .expect("upsert must not fail");

    assert_eq!(
        outcome.tasks.len(),
        1,
        "表記揺れがあっても slot は重複しない"
    );
}

#[test]
fn a_parent_chain_deeper_than_the_limit_is_rejected() {
    let mut tasks = Vec::new();
    for index in 0..30 {
        tasks.push(task_with(
            &format!("tasks/{index}.md"),
            Some(&format!("tasks/{}.md", index + 1)),
            &[],
        ));
    }
    tasks.push(task_with("tasks/30.md", None, &[]));
    let last = tasks.pop().expect("last task");

    let result = TaskIndex::new(tasks).rebuild_with_external_change(upserted(last));

    assert!(
        result.is_err(),
        "深すぎる親チェーンは Err にして呼び出し側が cache を不変にできるようにする"
    );
}
