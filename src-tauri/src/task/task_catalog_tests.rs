use super::*;
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
