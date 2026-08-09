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
fn rescan_sets_only_the_rescan_flag() {
    let batch = FileChangeBatch::rescan();

    assert!(batch.rescan, "rescan() は rescan フラグを立てるべき");
    assert!(
        batch.removed.is_empty(),
        "rescan batch に removed は載らない"
    );
    assert!(
        batch.upserted.is_empty(),
        "rescan batch に upserted は載らない"
    );
    assert!(batch.errors.is_empty(), "rescan batch に errors は載らない");
}

#[test]
fn from_failure_carries_only_the_reported_failure() {
    let failure = sample_failure();

    let batch = FileChangeBatch::from_failure(failure.clone());

    assert_eq!(vec![failure], batch.errors);
    assert!(!batch.rescan, "障害通知は rescan を立てない");
    assert!(batch.removed.is_empty(), "障害 batch に removed は載らない");
    assert!(
        batch.upserted.is_empty(),
        "障害 batch に upserted は載らない"
    );
}

#[test]
fn is_empty_table() {
    struct Case {
        name: &'static str,
        batch: FileChangeBatch,
        expected: bool,
    }

    let cases = vec![
        Case {
            name: "default は空",
            batch: FileChangeBatch::default(),
            expected: true,
        },
        Case {
            name: "removed が 1 件なら空でない",
            batch: FileChangeBatch {
                removed: vec![PathBuf::from("/tmp/a.md")],
                ..FileChangeBatch::default()
            },
            expected: false,
        },
        Case {
            name: "upserted が 1 件なら空でない",
            batch: FileChangeBatch {
                upserted: vec![PathBuf::from("/tmp/a.md")],
                ..FileChangeBatch::default()
            },
            expected: false,
        },
        Case {
            name: "rescan が立っていれば空でない",
            batch: FileChangeBatch::rescan(),
            expected: false,
        },
        Case {
            name: "errors が 1 件なら空でない",
            batch: FileChangeBatch::from_failure(sample_failure()),
            expected: false,
        },
    ];

    for c in cases {
        assert_eq!(c.expected, c.batch.is_empty(), "case `{}` failed", c.name);
    }
}
