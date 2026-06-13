//! `TaskIndex::children_paths_of` / `TaskIndex::plan_clear_children_of` の
//! 純粋関数ユニットテスト。AppState / TaskIo / fs::* に依存せず、
//! すべて in-memory で完結する。

use std::path::PathBuf;

use super::{ClearChildrenError, ClearChildrenInput, Task, TaskIndex};
use crate::task::frontmatter::{parse as parse_frontmatter, Parsed};
use crate::task::parse::{task_from_markdown, TaskParseContext};

// ---------------------------------------------------------------------------
// fixture helpers（`children_tests.rs` の helper を踏襲）
// ---------------------------------------------------------------------------

fn context(path: &str) -> TaskParseContext {
    TaskParseContext {
        file_path: PathBuf::from(path),
        default_status: "Todo".into(),
    }
}

fn task_from(input: &str, path: &str) -> Task {
    task_from_markdown(input.as_bytes(), &context(path)).unwrap()
}

fn task_with_parent(path: &str, parent: &str) -> Task {
    task_from(
        &format!("---\ntitle: Task\nstatus: Todo\nparent: {parent}\n---\n"),
        path,
    )
}

fn task_without_parent(path: &str) -> Task {
    task_from("---\ntitle: Task\nstatus: Todo\n---\n", path)
}

fn parsed_from_md(md: &str) -> Parsed {
    parse_frontmatter(md).expect("parse ok").expect("some")
}

// ---------------------------------------------------------------------------
// children_paths_of（7 ケース）
// ---------------------------------------------------------------------------

#[test]
fn children_paths_of_returns_single_direct_child() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let result = index.children_paths_of("tasks/p.md");

    assert_eq!(result, vec![PathBuf::from("tasks/c.md")]);
}

#[test]
fn children_paths_of_returns_two_children_in_snapshot_order() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c1.md", "tasks/p.md"),
        task_with_parent("tasks/c2.md", "tasks/p.md"),
    ]);

    let result = index.children_paths_of("tasks/p.md");

    assert_eq!(
        result,
        vec![PathBuf::from("tasks/c1.md"), PathBuf::from("tasks/c2.md")]
    );
}

#[test]
fn children_paths_of_returns_empty_when_target_has_no_children() {
    let index = TaskIndex::new(vec![task_without_parent("tasks/p.md")]);

    let result = index.children_paths_of("tasks/p.md");

    assert!(result.is_empty());
}

#[test]
fn children_paths_of_returns_empty_when_target_is_no_ones_parent() {
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/a.md"),
        task_with_parent("tasks/b.md", "tasks/a.md"),
    ]);

    let result = index.children_paths_of("tasks/orphan.md");

    assert!(result.is_empty());
}

#[test]
fn children_paths_of_excludes_grandchildren() {
    // p -> c -> g という 3 世代構造で、p の直接の子は c のみ。
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
        task_with_parent("tasks/g.md", "tasks/c.md"),
    ]);

    let result = index.children_paths_of("tasks/p.md");

    assert_eq!(result, vec![PathBuf::from("tasks/c.md")]);
}

#[test]
fn children_paths_of_distinguishes_same_title_by_path() {
    // 同一 title だが path が異なる 2 task。parent が p.md を指すのは c-real.md のみ。
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c-real.md", "tasks/p.md"),
        task_with_parent("tasks/c-fake.md", "tasks/other.md"),
        task_without_parent("tasks/other.md"),
    ]);

    let result = index.children_paths_of("tasks/p.md");

    assert_eq!(result, vec![PathBuf::from("tasks/c-real.md")]);
}

#[test]
fn children_paths_of_normalizes_path_notation() {
    // 子の parent 値が `./tasks/p.md` で記載されていても、
    // 引数 `tasks/p.md` と同一視して一致と判定する。
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "./tasks/p.md"),
    ]);

    let result = index.children_paths_of("tasks/p.md");

    assert_eq!(result, vec![PathBuf::from("tasks/c.md")]);
}

#[test]
fn children_paths_of_excludes_self_under_path_notation_variance() {
    // 異常データ: 削除対象自身が自分自身を parent として持つ。
    // raw 文字列比較だと `t.file_path = "tasks/p.md"` と `deleted_path = "./tasks/p.md"`
    // で自己除外をすり抜けて自分が子に出てしまうため、正規化比較で防ぐ。
    let mut self_referential = task_with_parent("tasks/p.md", "tasks/p.md");
    // parent をあえて表記揺れに変えて、正規化比較で同一視されることを確認する。
    self_referential.parent = Some(crate::task::task_file_path::TaskFilePath::from_lenient(
        "./tasks/p.md",
    ));

    let index = TaskIndex::new(vec![self_referential]);

    let result = index.children_paths_of("./tasks/p.md");

    assert!(result.is_empty());
}

// ---------------------------------------------------------------------------
// plan_clear_children_of（8 ケース）
// ---------------------------------------------------------------------------

#[test]
fn plan_clear_children_of_returns_empty_outcome_for_empty_loaded() {
    let index = TaskIndex::new(Vec::new());

    let outcome = index
        .plan_clear_children_of("tasks/p.md", Vec::new())
        .expect("ok");

    assert!(outcome.entries.is_empty());
}

#[test]
fn plan_clear_children_of_removes_parent_key_only() {
    let child_md = "---\n\
                    title: Child\n\
                    status: Doing\n\
                    priority: High\n\
                    labels:\n  - bug\n  - api\n\
                    parent: tasks/p.md\n\
                    links:\n  - tasks/other.md\n\
                    ---\nbody\n";
    let parsed = parsed_from_md(child_md);
    let child_task = task_with_parent("tasks/c.md", "tasks/p.md");
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        child_task,
        task_without_parent("tasks/other.md"),
    ]);

    let loaded = vec![ClearChildrenInput {
        path: PathBuf::from("tasks/c.md"),
        parsed,
    }];
    let outcome = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect("ok");

    assert_eq!(outcome.entries.len(), 1);
    let entry = &outcome.entries[0];
    assert_eq!(entry.path, PathBuf::from("tasks/c.md"));
    assert!(!entry.file_content.contains("parent:"));
    assert!(entry.file_content.contains("title: Child"));
    assert!(entry.file_content.contains("status: Doing"));
    assert!(entry.file_content.contains("priority: High"));
    assert!(entry.file_content.contains("- bug"));
    assert!(entry.file_content.contains("- api"));
    assert!(entry.file_content.contains("- tasks/other.md"));
    assert!(entry.updated_task.parent.is_none());
    assert_eq!(entry.updated_task.title.as_str(), "Child");
    assert_eq!(entry.updated_task.status.as_str(), "Doing");
}

#[test]
fn plan_clear_children_of_preserves_loaded_order_with_two_inputs() {
    let parsed_a = parsed_from_md("---\ntitle: A\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let parsed_b = parsed_from_md("---\ntitle: B\nstatus: Todo\nparent: tasks/p.md\n---\n");
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/a.md", "tasks/p.md"),
        task_with_parent("tasks/b.md", "tasks/p.md"),
    ]);

    let loaded = vec![
        ClearChildrenInput {
            path: PathBuf::from("tasks/a.md"),
            parsed: parsed_a,
        },
        ClearChildrenInput {
            path: PathBuf::from("tasks/b.md"),
            parsed: parsed_b,
        },
    ];
    let outcome = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect("ok");

    assert_eq!(outcome.entries.len(), 2);
    assert_eq!(outcome.entries[0].path, PathBuf::from("tasks/a.md"));
    assert_eq!(outcome.entries[1].path, PathBuf::from("tasks/b.md"));
    assert!(outcome.entries[0].updated_task.parent.is_none());
    assert!(outcome.entries[1].updated_task.parent.is_none());
    assert_eq!(outcome.entries[0].updated_task.title.as_str(), "A");
    assert_eq!(outcome.entries[1].updated_task.title.as_str(), "B");
}

#[test]
fn plan_clear_children_of_preserves_typed_field_order() {
    // frontmatter::serialize 規約: title → status → priority → labels → links → extras 出現順
    let parsed = parsed_from_md(
        "---\n\
         title: T\n\
         status: Todo\n\
         priority: Medium\n\
         labels:\n  - x\n\
         parent: tasks/p.md\n\
         links:\n  - tasks/o.md\n\
         due: 2026-05-17\n\
         ---\n",
    );
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let loaded = vec![ClearChildrenInput {
        path: PathBuf::from("tasks/c.md"),
        parsed,
    }];
    let outcome = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect("ok");

    let content = &outcome.entries[0].file_content;
    let title_pos = content.find("title:").expect("title present");
    let status_pos = content.find("status:").expect("status present");
    let priority_pos = content.find("priority:").expect("priority present");
    let labels_pos = content.find("labels:").expect("labels present");
    let links_pos = content.find("links:").expect("links present");
    let due_pos = content.find("due:").expect("due present");

    assert!(title_pos < status_pos);
    assert!(status_pos < priority_pos);
    assert!(priority_pos < labels_pos);
    assert!(labels_pos < links_pos);
    assert!(links_pos < due_pos);
    assert!(!content.contains("parent:"));
}

#[test]
fn plan_clear_children_of_normalizes_crlf_to_lf_in_body() {
    // 入力 md は CRLF 込みで構築するが、parse_frontmatter 段階で LF 正規化されるため、
    // serialize 出力にも CRLF は混入しない。
    let parsed = parsed_from_md(
        "---\r\ntitle: T\r\nstatus: Todo\r\nparent: tasks/p.md\r\n---\r\nbody line\r\nnext\r\n",
    );
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let loaded = vec![ClearChildrenInput {
        path: PathBuf::from("tasks/c.md"),
        parsed,
    }];
    let outcome = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect("ok");

    let content = &outcome.entries[0].file_content;
    assert!(!content.contains('\r'));
    assert!(content.contains("body line\nnext"));
}

#[test]
fn plan_clear_children_of_appends_trailing_newline_to_body() {
    // 入力 body 末尾に改行がなくても、serialize 規約により出力末尾には `\n` が付く。
    let parsed =
        parsed_from_md("---\ntitle: T\nstatus: Todo\nparent: tasks/p.md\n---\nno-trailing-newline");
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let loaded = vec![ClearChildrenInput {
        path: PathBuf::from("tasks/c.md"),
        parsed,
    }];
    let outcome = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect("ok");

    let content = &outcome.entries[0].file_content;
    assert!(content.ends_with('\n'));
}

#[test]
fn plan_clear_children_of_rejects_oversized_content() {
    // body を 1 MiB 超に膨らませる。serialize 後の出力が 1 MiB を超えるため
    // TaskContent::try_new で TooLarge エラーになる。
    let big_body: String = "a".repeat(1024 * 1024 + 16);
    let md = format!("---\ntitle: T\nstatus: Todo\nparent: tasks/p.md\n---\n{big_body}\n");
    let parsed = parsed_from_md(&md);
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let loaded = vec![ClearChildrenInput {
        path: PathBuf::from("tasks/c.md"),
        parsed,
    }];
    let err = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect_err("should reject oversized content");

    match err {
        ClearChildrenError::ContentRejected { path, .. } => {
            assert_eq!(path, PathBuf::from("tasks/c.md"));
        }
    }
}

#[test]
fn plan_clear_children_of_rejects_nul_byte_content() {
    // body に NUL byte を含めると TaskContent::try_new が BinaryDetected を返す。
    let parsed = parsed_from_md(
        "---\ntitle: T\nstatus: Todo\nparent: tasks/p.md\n---\nbefore\u{0000}after\n",
    );
    let index = TaskIndex::new(vec![
        task_without_parent("tasks/p.md"),
        task_with_parent("tasks/c.md", "tasks/p.md"),
    ]);

    let loaded = vec![ClearChildrenInput {
        path: PathBuf::from("tasks/c.md"),
        parsed,
    }];
    let err = index
        .plan_clear_children_of("tasks/p.md", loaded)
        .expect_err("should reject NUL byte content");

    match err {
        ClearChildrenError::ContentRejected { path, .. } => {
            assert_eq!(path, PathBuf::from("tasks/c.md"));
        }
    }
}
