use super::*;
use crate::watcher::core::WatcherFailureKind;

fn sample_failure() -> WatcherFailure {
    WatcherFailure {
        kind: WatcherFailureKind::ResourceExhausted,
        paths: Vec::new(),
        detail: "inotify watch limit reached".to_string(),
    }
}

#[test]
fn builder_empty_builds_the_only_empty_mode() {
    let batch = FileChangeBatchTestBuilder::empty().build();

    assert!(batch.is_empty());
    assert!(batch.removed().is_empty());
    assert!(batch.upserted().is_empty());
    assert!(!batch.is_rescan());
    assert!(batch.errors().is_empty());
}

#[test]
fn builder_changes_preserves_disjoint_paths() {
    let removed = vec![PathBuf::from("old-a.md"), PathBuf::from("old-b.md")];
    let upserted = vec![PathBuf::from("new-a.md"), PathBuf::from("new-b.md")];

    let batch = FileChangeBatchTestBuilder::changes(removed.clone(), upserted.clone()).build();

    assert_eq!(removed, batch.removed());
    assert_eq!(upserted, batch.upserted());
    assert!(!batch.is_rescan());
    assert!(batch.errors().is_empty());
    assert!(!batch.is_empty());
}

#[test]
fn builder_rescan_builds_only_the_rescan_mode() {
    let batch = FileChangeBatchTestBuilder::rescan().build();

    assert!(batch.is_rescan());
    assert!(batch.removed().is_empty());
    assert!(batch.upserted().is_empty());
    assert!(batch.errors().is_empty());
    assert!(!batch.is_empty());
}

#[test]
fn builder_failure_builds_only_the_failure_mode() {
    let failure = sample_failure();

    let batch = FileChangeBatchTestBuilder::failure(failure.clone()).build();

    assert_eq!([failure], batch.errors());
    assert!(!batch.is_rescan());
    assert!(batch.removed().is_empty());
    assert!(batch.upserted().is_empty());
    assert!(!batch.is_empty());
}

#[test]
#[should_panic(expected = "changes mode must contain at least one path")]
fn builder_changes_rejects_empty_path_lists() {
    let _ = FileChangeBatchTestBuilder::changes(Vec::new(), Vec::new());
}

#[test]
#[should_panic(expected = "removed paths must be unique")]
fn builder_changes_rejects_duplicate_removed_paths() {
    let duplicate = PathBuf::from("same.md");

    let _ = FileChangeBatchTestBuilder::changes(vec![duplicate.clone(), duplicate], Vec::new());
}

#[test]
#[should_panic(expected = "upserted paths must be unique")]
fn builder_changes_rejects_duplicate_upserted_paths() {
    let duplicate = PathBuf::from("same.md");

    let _ = FileChangeBatchTestBuilder::changes(Vec::new(), vec![duplicate.clone(), duplicate]);
}

#[test]
#[should_panic(expected = "removed and upserted paths must be disjoint")]
fn builder_changes_rejects_a_path_in_both_lists() {
    let shared = PathBuf::from("same.md");

    let _ = FileChangeBatchTestBuilder::changes(vec![shared.clone()], vec![shared]);
}
