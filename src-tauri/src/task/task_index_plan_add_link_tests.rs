//! `TaskIndex::plan_add_link` の純粋関数ユニットテスト。
//!
//! AppState / TaskIo / fs::* に依存せず、すべて in-memory で完結する。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use super::{AddLinkIntent, AddLinkOutcome, Task, TaskIndex};
use crate::config::column_name::ColumnName;
use crate::task::add_link::error::{AddLinkError, ContentRejectReason};
use crate::task::frontmatter::{parse as parse_frontmatter, Parsed};
use crate::task::task_file_path::TaskFilePath;

fn make_task(file_path: &str) -> Task {
    let fp = TaskFilePath::from_lenient(file_path);
    Task {
        id: fp.clone(),
        file_path: fp,
        title: "T".into(),
        status: ColumnName::from_lenient("Todo"),
        priority: None,
        labels: Vec::new(),
        parent: None,
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

fn intent(source: &str, target: &str) -> AddLinkIntent {
    AddLinkIntent {
        source: PathBuf::from(source),
        target: PathBuf::from(target),
    }
}

fn project_root() -> &'static Path {
    Path::new("/project")
}

#[test]
fn plan_add_link_appends_target_to_empty_links() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\nbody\n");

    let outcome = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        AddLinkOutcome::Write {
            updated_task,
            file_content,
            target_normalized,
        } => {
            assert!(
                file_content.contains("links:"),
                "expected links: section, got {file_content:?}"
            );
            assert!(file_content.contains("- tasks/b.md"));
            assert_eq!(target_normalized, "tasks/b.md");
            assert_eq!(
                updated_task
                    .links
                    .iter()
                    .map(|p| p.as_str().to_string())
                    .collect::<Vec<_>>(),
                vec!["tasks/b.md".to_string()]
            );
        }
        AddLinkOutcome::NoOp { .. } => panic!("expected Write, got NoOp"),
    }
}

#[test]
fn plan_add_link_returns_noop_when_target_already_linked() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n---\nbody\n");

    let outcome = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        AddLinkOutcome::NoOp { existing_task } => {
            assert_eq!(existing_task.file_path.as_str(), source.file_path.as_str());
        }
        AddLinkOutcome::Write { .. } => panic!("expected NoOp, got Write"),
    }
}

#[test]
fn plan_add_link_returns_noop_for_path_variation_equivalent_to_existing() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    // 既存 links は `./tasks/b.md`、追加 target は `tasks/b.md`。normalize 後同一。
    let parsed =
        parsed_from_md("---\ntitle: A\nstatus: Todo\nlinks:\n  - ./tasks/b.md\n---\nbody\n");

    let outcome = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    assert!(matches!(outcome, AddLinkOutcome::NoOp { .. }));
}

#[test]
fn plan_add_link_rejects_self_link() {
    let source = make_task("tasks/a.md");
    let index = TaskIndex::new(vec![source.clone()]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");

    let err = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/a.md"),
            &source,
            parsed,
        )
        .expect_err("self-link should be rejected");

    assert!(matches!(err, AddLinkError::SelfLink { .. }));
}

#[test]
fn plan_add_link_rejects_target_not_found_in_index() {
    let source = make_task("tasks/a.md");
    let index = TaskIndex::new(vec![source.clone()]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\n---\n");

    let err = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/missing.md"),
            &source,
            parsed,
        )
        .expect_err("target absent should be rejected");

    assert!(matches!(err, AddLinkError::TargetNotFound { .. }));
}

#[test]
fn plan_add_link_preserves_existing_links_order_and_appends_at_end() {
    let source = make_task("tasks/a.md");
    let b = make_task("tasks/b.md");
    let c = make_task("tasks/c.md");
    let d = make_task("tasks/d.md");
    let index = TaskIndex::new(vec![source.clone(), b, c, d]);
    let parsed = parsed_from_md(
        "---\ntitle: A\nstatus: Todo\nlinks:\n  - tasks/b.md\n  - tasks/c.md\n---\n",
    );

    let outcome = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/d.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        AddLinkOutcome::Write {
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
                vec![
                    "tasks/b.md".to_string(),
                    "tasks/c.md".to_string(),
                    "tasks/d.md".to_string(),
                ]
            );
            let b_pos = file_content.find("- tasks/b.md").expect("b");
            let c_pos = file_content.find("- tasks/c.md").expect("c");
            let d_pos = file_content.find("- tasks/d.md").expect("d");
            assert!(b_pos < c_pos && c_pos < d_pos, "order preserved");
        }
        AddLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}

#[test]
fn plan_add_link_preserves_extras_and_body() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nassignee: alice\n---\nhello world\n");

    let outcome = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        AddLinkOutcome::Write {
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
        AddLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}

#[test]
fn plan_add_link_emits_links_after_parent_in_yaml_output() {
    let source = make_task("tasks/a.md");
    let parent = make_task("tasks/p.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), parent, target]);
    let parsed = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");

    let outcome = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect("ok");

    match outcome {
        AddLinkOutcome::Write { file_content, .. } => {
            let parent_pos = file_content.find("parent:").expect("parent");
            let links_pos = file_content.find("links:").expect("links");
            let title_pos = file_content.find("title:").expect("title");
            let status_pos = file_content.find("status:").expect("status");
            assert!(
                title_pos < status_pos && status_pos < parent_pos && parent_pos < links_pos,
                "expected order title < status < parent < links in {file_content:?}"
            );
        }
        AddLinkOutcome::NoOp { .. } => panic!("expected Write"),
    }
}

#[test]
fn plan_add_link_returns_content_rejected_when_serialized_too_large() {
    let source = make_task("tasks/a.md");
    let target = make_task("tasks/b.md");
    let index = TaskIndex::new(vec![source.clone(), target]);

    // 1 MiB を超える body を含む source。link push 後の serialize 結果は
    // TaskContent::try_new で TooLarge として弾かれることを期待する。
    let huge_body: String = "x".repeat(1024 * 1024 + 128);
    let md = format!("---\ntitle: A\nstatus: Todo\n---\n{huge_body}\n");
    let parsed = parsed_from_md(&md);

    let err = index
        .plan_add_link(
            project_root(),
            intent("tasks/a.md", "tasks/b.md"),
            &source,
            parsed,
        )
        .expect_err("oversized content should be rejected");

    match err {
        AddLinkError::ContentRejected {
            reason: ContentRejectReason::TooLarge { .. },
        } => {}
        other => panic!("expected ContentRejected(TooLarge), got {other:?}"),
    }
}
