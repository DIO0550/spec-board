use std::fs;
use std::path::Path;

use tempfile::TempDir;

use super::{read_template_files, templates_dir_path, TemplateFile};

fn tempdir() -> TempDir {
    tempfile::tempdir().expect("create temp dir")
}

fn write_template(root: &Path, file_name: &str, content: &str) {
    let dir = templates_dir_path(root);
    fs::create_dir_all(&dir).expect("create templates dir");
    fs::write(dir.join(file_name), content).expect("write template");
}

#[test]
fn read_template_files_returns_empty_when_templates_dir_is_missing() {
    let dir = tempdir();
    let templates = read_template_files(dir.path()).expect("should succeed");
    assert!(templates.is_empty());
}

#[test]
fn read_template_files_returns_md_files_sorted_by_name() {
    let dir = tempdir();
    write_template(dir.path(), "feature.md", "feature body");
    write_template(dir.path(), "bug.md", "bug body");
    let templates = read_template_files(dir.path()).expect("should succeed");
    assert_eq!(
        templates,
        vec![
            TemplateFile {
                name: "bug".to_string(),
                content: "bug body".to_string(),
            },
            TemplateFile {
                name: "feature".to_string(),
                content: "feature body".to_string(),
            },
        ]
    );
}

#[test]
fn read_template_files_ignores_non_md_files_and_subdirectories() {
    let dir = tempdir();
    write_template(dir.path(), "bug.md", "bug body");
    write_template(dir.path(), "note.txt", "not a template");
    write_template(dir.path(), "README", "no extension");
    fs::create_dir_all(templates_dir_path(dir.path()).join("nested.md"))
        .expect("create nested dir");
    let templates = read_template_files(dir.path()).expect("should succeed");
    let names: Vec<&str> = templates
        .iter()
        .map(|template| template.name.as_str())
        .collect();
    assert_eq!(names, vec!["bug"]);
}

#[test]
fn read_template_files_returns_empty_when_templates_path_is_a_file() {
    let dir = tempdir();
    fs::create_dir_all(dir.path().join(".spec-board")).expect("create spec-board dir");
    fs::write(templates_dir_path(dir.path()), "not a dir").expect("write file");
    let templates = read_template_files(dir.path()).expect("should succeed");
    assert!(templates.is_empty());
}

#[cfg(unix)]
#[test]
fn read_template_files_ignores_symlinked_md_files() {
    let dir = tempdir();
    write_template(dir.path(), "real.md", "real body");
    let target = dir.path().join("outside.md");
    fs::write(&target, "outside body").expect("write outside file");
    std::os::unix::fs::symlink(&target, templates_dir_path(dir.path()).join("linked.md"))
        .expect("create symlink");
    let templates = read_template_files(dir.path()).expect("should succeed");
    let names: Vec<&str> = templates
        .iter()
        .map(|template| template.name.as_str())
        .collect();
    assert_eq!(names, vec!["real"]);
}
