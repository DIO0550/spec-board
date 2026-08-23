use super::*;

use crate::project::load_warning::{ProjectLoadWarningCode, ProjectLoadWarningStage};

use std::path::Path;

use tempfile::TempDir;

use crate::task::io::{FsTaskIo, InMemoryTaskIo};

fn todo() -> ColumnName {
    "Todo".into()
}

fn write_md(root: &Path, rel: &str, body: &str) {
    let absolute = root.join(rel);
    if let Some(parent) = absolute.parent() {
        std::fs::create_dir_all(parent).expect("create parent dir");
    }
    std::fs::write(&absolute, body).expect("write md");
}

fn task_md(title: &str) -> String {
    format!("---\ntitle: {title}\nstatus: Todo\n---\n\nbody\n")
}

fn sorted_paths(tasks: &[Task]) -> Vec<String> {
    let mut paths: Vec<String> = tasks
        .iter()
        .map(|task| task.file_path().as_str().to_string())
        .collect();
    paths.sort();
    paths
}

#[test]
fn returns_tasks_with_children_and_reverse_links_from_multiple_md_files() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/parent.md", &task_md("Parent"));
    write_md(
        dir.path(),
        "tasks/child.md",
        "---\ntitle: Child\nstatus: Todo\nparent: tasks/parent.md\nlinks:\n  - tasks/parent.md\n---\n",
    );

    let tasks = rebuild_tasks_from_disk(dir.path(), &todo(), &FsTaskIo).expect("rebuild ok");

    let parent = tasks
        .iter()
        .find(|task| task.file_path().as_str() == "tasks/parent.md")
        .expect("parent present");
    assert_eq!(vec!["tasks/child.md".to_string()], parent.children());
    assert_eq!(vec!["tasks/child.md".to_string()], parent.reverse_links());
}

#[test]
fn returns_an_empty_vec_for_a_directory_without_md_files() {
    let dir = TempDir::new().expect("tempdir");

    let tasks = rebuild_tasks_from_disk(dir.path(), &todo(), &FsTaskIo).expect("rebuild ok");

    assert!(tasks.is_empty());
}

#[test]
fn skips_a_file_with_broken_frontmatter_and_keeps_the_others() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/ok.md", &task_md("Ok"));
    write_md(
        dir.path(),
        "tasks/broken.md",
        "---\ntitle: [unclosed\n---\n",
    );

    let tasks = rebuild_tasks_from_disk(dir.path(), &todo(), &FsTaskIo).expect("rebuild ok");

    assert_eq!(vec!["tasks/ok.md".to_string()], sorted_paths(&tasks));
}

#[test]
fn skips_a_file_whose_read_fails_and_keeps_the_others() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/ok.md", &task_md("Ok"));
    write_md(dir.path(), "tasks/unreadable.md", &task_md("Unreadable"));
    let io = InMemoryTaskIo::new();
    io.pre_register_dir(&dir.path().join("tasks"));
    io.write_new(&dir.path().join("tasks/ok.md"), task_md("Ok").as_bytes())
        .expect("seed readable file");

    let tasks = rebuild_tasks_from_disk(dir.path(), &todo(), &io).expect("rebuild ok");

    assert_eq!(
        vec!["tasks/ok.md".to_string()],
        sorted_paths(&tasks),
        "read が Err の md は skip し、他は返す（fs::read 直呼び時代と同値）"
    );
}

#[test]
fn an_injected_io_port_produces_the_same_result_as_the_real_filesystem() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/a.md", &task_md("A"));
    write_md(dir.path(), "tasks/b.md", &task_md("B"));
    let io = InMemoryTaskIo::new();
    io.pre_register_dir(&dir.path().join("tasks"));
    for rel in ["tasks/a.md", "tasks/b.md"] {
        let title = if rel.contains('a') { "A" } else { "B" };
        io.write_new(&dir.path().join(rel), task_md(title).as_bytes())
            .expect("seed");
    }

    let from_fs = rebuild_tasks_from_disk(dir.path(), &todo(), &FsTaskIo).expect("rebuild ok");
    let from_memory = rebuild_tasks_from_disk(dir.path(), &todo(), &io).expect("rebuild ok");

    assert_eq!(sorted_paths(&from_fs), sorted_paths(&from_memory));
}

#[test]
fn reports_a_scan_error_when_the_root_is_gone() {
    let dir = TempDir::new().expect("tempdir");
    let root = dir.path().to_path_buf();
    drop(dir);

    let error = rebuild_tasks_from_disk(&root, &todo(), &FsTaskIo).expect_err("root is gone");

    assert!(matches!(error, RebuildTasksError::Scan(_)));
}

#[test]
fn applies_the_same_file_filter_as_scan_md_files() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/plain.md", &task_md("Plain"));
    write_md(dir.path(), "tasks/upper.MD", &task_md("Upper"));
    write_md(dir.path(), ".hidden/secret.md", &task_md("Hidden"));
    write_md(dir.path(), "node_modules/dep.md", &task_md("Dep"));
    write_md(dir.path(), "tasks/notes.txt", "not markdown");

    let tasks = rebuild_tasks_from_disk(dir.path(), &todo(), &FsTaskIo).expect("rebuild ok");

    let scanned: Vec<String> = {
        let mut paths: Vec<String> = spec_board_fs::task::file_scanner::scan_md_files(dir.path())
            .expect("scan ok")
            .into_iter()
            .map(|rel| rel.to_string_lossy().replace('\\', "/"))
            .collect();
        paths.sort();
        paths
    };
    assert_eq!(scanned, sorted_paths(&tasks));
}

#[test]
fn report_contains_frontmatter_parse_warning_and_keeps_valid_tasks() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/ok.md", &task_md("Ok"));
    write_md(
        dir.path(),
        "tasks/broken.md",
        "---\ntitle: [unclosed\n---\n",
    );

    let report = rebuild_tasks_from_disk_with_report(dir.path(), &todo(), &FsTaskIo)
        .expect("rebuild report should succeed");

    assert_eq!(vec!["tasks/ok.md".to_string()], sorted_paths(&report.tasks));
    assert!(report.warnings.iter().any(|warning| {
        warning.code == ProjectLoadWarningCode::FrontmatterParseFailed
            && warning.stage == ProjectLoadWarningStage::Parse
            && warning.path.as_deref() == Some("tasks/broken.md")
            && warning.recoverable
    }));
}

#[test]
fn report_contains_task_read_warning_from_io_port() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/ok.md", &task_md("Ok"));
    write_md(dir.path(), "tasks/unreadable.md", &task_md("Unreadable"));
    let io = InMemoryTaskIo::new();
    io.pre_register_dir(&dir.path().join("tasks"));
    io.write_new(&dir.path().join("tasks/ok.md"), task_md("Ok").as_bytes())
        .expect("seed readable file");

    let report = rebuild_tasks_from_disk_with_report(dir.path(), &todo(), &io)
        .expect("rebuild report should succeed");

    assert_eq!(vec!["tasks/ok.md".to_string()], sorted_paths(&report.tasks));
    assert!(report.warnings.iter().any(|warning| {
        warning.code == ProjectLoadWarningCode::TaskReadFailed
            && warning.stage == ProjectLoadWarningStage::Read
            && warning.path.as_deref() == Some("tasks/unreadable.md")
    }));
}

#[test]
fn report_maps_scan_warnings_and_keeps_normal_tasks() {
    let dir = TempDir::new().expect("tempdir");
    write_md(dir.path(), "tasks/ok.md", &task_md("Ok"));
    let binary_path = dir.path().join("tasks/binary.md");
    std::fs::write(&binary_path, b"binary\x00content").expect("write binary file");
    let oversized_path = dir.path().join("tasks/oversized.md");
    let oversized = std::fs::File::create(&oversized_path).expect("create oversized file");
    oversized
        .set_len(1024 * 1024 + 1)
        .expect("resize oversized file");

    let report = rebuild_tasks_from_disk_with_report(dir.path(), &todo(), &FsTaskIo)
        .expect("rebuild report should succeed");

    assert_eq!(vec!["tasks/ok.md".to_string()], sorted_paths(&report.tasks));
    assert!(report.warnings.iter().any(|warning| {
        warning.code == ProjectLoadWarningCode::BinaryFile
            && warning.stage == ProjectLoadWarningStage::Scan
            && warning.path.as_deref() == Some("tasks/binary.md")
    }));
    assert!(report.warnings.iter().any(|warning| {
        warning.code == ProjectLoadWarningCode::FileTooLarge
            && warning.stage == ProjectLoadWarningStage::Scan
            && warning.path.as_deref() == Some("tasks/oversized.md")
    }));
}

#[test]
fn report_keeps_hierarchy_failure_fatal() {
    let dir = TempDir::new().expect("tempdir");
    for index in 0..21 {
        let body = format!(
            "---\ntitle: Task {index}\nstatus: Todo\nparent: tasks/{}.md\n---\n",
            index + 1
        );
        write_md(dir.path(), &format!("tasks/{index}.md"), &body);
    }
    write_md(dir.path(), "tasks/21.md", &task_md("Root"));

    let error = rebuild_tasks_from_disk_with_report(dir.path(), &todo(), &FsTaskIo)
        .expect_err("hierarchy depth must remain fatal");

    assert!(matches!(error, RebuildTasksError::Hierarchy(_)));
}
