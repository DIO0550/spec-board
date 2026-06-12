//! `TaskIndex::plan_remove_link` の純粋関数ユニットテスト。
//!
//! AppState / TaskIo / fs::* に依存せず、すべて in-memory で完結する。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use super::{RemoveLinkIntent, RemoveLinkOutcome, Task, TaskIndex};
use crate::config::column_name::ColumnName;
use crate::task::frontmatter::{parse as parse_frontmatter, Parsed};
use crate::task::task_file_path::TaskFilePath;

fn make_task(file_path: &str) -> Task {
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
        draft: false,
        id: fp.clone(),
        file_path: fp,
        title: "T".into(),
        status: ColumnName::from_lenient("Todo"),
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

fn parsed_from_md(md: &str) -> Parsed {
    parse_frontmatter(md).expect("parse ok").expect("some")
}

fn intent(source: &str, target: &str) -> RemoveLinkIntent {
    RemoveLinkIntent {
        source: PathBuf::from(source),
        target: PathBuf::from(target),
    }
}

fn project_root() -> &'static Path {
    Path::new("/project")
}

#[test]
fn removes_single_existing_link() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n---\nbody\n");

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        RemoveLinkOutcome::Write {
            updated_task,
            file_content,
            target_normalized,
        } => {
            assert!(
                !file_content.contains("links:"),
                "links key should be removed when last entry is dropped, got {file_content:?}"
            );
            assert_eq!(target_normalized, "tasks/b.md");
            assert!(
                updated_task.links.is_empty(),
                "links should be empty, got {:?}",
                updated_task.links
            );
        }
        RemoveLinkOutcome::NoOp { .. } => panic!("expected Write, got NoOp"),
    }
}

#[test]
fn removes_all_duplicate_entries() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    // 同一 target が表記揺れで 2 件登録された状態。両方とも除去されるべき。
    let parsed = parsed_from_md(
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n  - ./tasks/b.md\n---\n",
    );

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        RemoveLinkOutcome::Write { updated_task, .. } => {
            assert!(
                updated_task.links.is_empty(),
                "all duplicates should be removed, got {:?}",
                updated_task.links
            );
        }
        RemoveLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}

#[test]
fn returns_noop_when_target_absent() {
    let source = make_task("tasks/a.md");
    let other = make_task("tasks/c.md");
    let index = TaskIndex::new(vec![source.clone(), other]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/c.md\n---\n");

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        RemoveLinkOutcome::NoOp { existing_task } => {
            assert_eq!(existing_task.file_path.as_str(), source.file_path.as_str());
        }
        RemoveLinkOutcome::Write { .. } => panic!("expected NoOp, got Write"),
    }
}

#[test]
fn normalizes_path_notation_for_match() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    // links 側は `./tasks/b.md`、target は `tasks/b.md`。normalize 後同一。
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nlinks:\n  - ./tasks/b.md\n---\n");

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        RemoveLinkOutcome::Write { updated_task, .. } => {
            assert!(updated_task.links.is_empty());
        }
        RemoveLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}

#[test]
fn returns_noop_when_links_empty() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    assert!(matches!(outcome, RemoveLinkOutcome::NoOp { .. }));
}

#[test]
fn preserves_other_links() {
    let source = make_task("tasks/a.md");
    let b = make_task("tasks/b.md");
    let c = make_task("tasks/c.md");
    let d = make_task("tasks/d.md");
    let index = TaskIndex::new(vec![source.clone(), b, c, d]);
    let parsed = parsed_from_md(
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n  - tasks/c.md\n  - tasks/d.md\n---\n",
    );

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/c.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        RemoveLinkOutcome::Write {
            updated_task,
            file_content,
            ..
        } => {
            let links: Vec<String> = updated_task
                .links
                .iter()
                .map(|p| p.as_str().to_string())
                .collect();
            assert_eq!(
                links,
                vec!["tasks/b.md".to_string(), "tasks/d.md".to_string()]
            );
            let b_pos = file_content.find("- tasks/b.md").expect("b");
            let d_pos = file_content.find("- tasks/d.md").expect("d");
            assert!(b_pos < d_pos, "order preserved");
            assert!(
                !file_content.contains("- tasks/c.md"),
                "removed entry should not remain"
            );
        }
        RemoveLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}

#[test]
fn preserves_body_and_extras() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    let parsed = parsed_from_md(
        "---\ntitle: A\nstatus: Todo\nassignee: alice\nlinks:\n  - tasks/b.md\n---\nhello world\n",
    );

    let outcome = index
        .plan_remove_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        RemoveLinkOutcome::Write {
            updated_task,
            file_content,
            ..
        } => {
            assert!(
                file_content.contains("assignee: alice"),
                "extras preserved: {file_content:?}"
            );
            assert!(file_content.contains("hello world"));
            assert_eq!(
                updated_task
                    .extras
                    .get("assignee")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                Some("alice".to_string())
            );
            assert!(updated_task.body.contains("hello world"));
        }
        RemoveLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}
