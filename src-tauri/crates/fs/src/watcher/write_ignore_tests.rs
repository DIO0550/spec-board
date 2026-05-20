use super::{WriteIgnoreError, WriteIgnoreRegistry};

use std::path::PathBuf;
use std::sync::{Arc, Barrier};
use std::thread;

#[test]
fn new_registry_is_empty_and_unregistered_path_is_not_ignored() {
    let registry = WriteIgnoreRegistry::new();

    assert!(registry.is_empty().expect("registry should be readable"));
    assert_eq!(0, registry.len().expect("registry should be readable"));
    assert!(!registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
}

#[test]
fn registered_path_is_ignored() {
    let registry = WriteIgnoreRegistry::new();

    assert!(registry
        .register("tasks/example.md")
        .expect("registry should be writable"));
    assert!(registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
    assert_eq!(1, registry.len().expect("registry should be readable"));
    assert!(!registry.is_empty().expect("registry should be readable"));
}

#[test]
fn should_ignore_keeps_registered_path_until_explicit_removal() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register("tasks/example.md")
        .expect("registry should be writable");

    assert!(registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
    assert!(registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
    assert_eq!(1, registry.len().expect("registry should be readable"));
}

#[test]
fn duplicate_register_returns_false_and_keeps_len() {
    let registry = WriteIgnoreRegistry::new();

    assert!(registry
        .register("tasks/example.md")
        .expect("registry should be writable"));
    assert!(!registry
        .register("tasks/example.md")
        .expect("registry should be writable"));
    assert_eq!(1, registry.len().expect("registry should be readable"));
}

#[test]
fn unregistered_path_is_not_ignored_after_unregister() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register("tasks/example.md")
        .expect("registry should be writable");

    assert!(registry
        .unregister("tasks/example.md")
        .expect("registry should be writable"));
    assert!(!registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
    assert!(registry.is_empty().expect("registry should be readable"));
}

#[test]
fn unregister_missing_path_returns_false() {
    let registry = WriteIgnoreRegistry::new();

    assert!(!registry
        .unregister("tasks/missing.md")
        .expect("registry should be writable"));
}

#[test]
fn consume_returns_true_once_and_removes_path() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register("tasks/example.md")
        .expect("registry should be writable");

    assert!(registry
        .consume("tasks/example.md")
        .expect("registry should be writable"));
    assert!(!registry
        .consume("tasks/example.md")
        .expect("registry should be writable"));
    assert!(!registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
    assert!(registry.is_empty().expect("registry should be readable"));
}

#[test]
fn concurrent_consume_allows_only_one_success() {
    const THREAD_COUNT: usize = 8;

    let registry = Arc::new(WriteIgnoreRegistry::new());
    let barrier = Arc::new(Barrier::new(THREAD_COUNT));

    registry
        .register("tasks/example.md")
        .expect("registry should be writable");

    let handles = (0..THREAD_COUNT)
        .map(|_| {
            let registry = Arc::clone(&registry);
            let barrier = Arc::clone(&barrier);

            thread::spawn(move || {
                barrier.wait();

                registry
                    .consume("tasks/example.md")
                    .expect("consume should work")
            })
        })
        .collect::<Vec<_>>();

    let success_count = handles
        .into_iter()
        .map(|handle| handle.join().expect("thread should not panic"))
        .filter(|consumed| *consumed)
        .count();

    assert_eq!(1, success_count);
    assert!(registry.is_empty().expect("registry should be readable"));
}

#[test]
fn different_path_representations_are_different_keys() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register("tasks/example.md")
        .expect("registry should be writable");

    assert!(registry
        .should_ignore("tasks/example.md")
        .expect("registry should be readable"));
    assert!(!registry
        .should_ignore("./tasks/example.md")
        .expect("registry should be readable"));
    assert!(registry
        .register("./tasks/example.md")
        .expect("registry should be writable"));
    assert_eq!(2, registry.len().expect("registry should be readable"));
}

#[test]
fn concurrent_access_is_synchronized() {
    const THREAD_COUNT: usize = 8;

    let registry = Arc::new(WriteIgnoreRegistry::new());
    let barrier = Arc::new(Barrier::new(THREAD_COUNT));
    let handles = (0..THREAD_COUNT)
        .map(|index| {
            let registry = Arc::clone(&registry);
            let barrier = Arc::clone(&barrier);

            thread::spawn(move || {
                let path = PathBuf::from(format!("tasks/{index}.md"));

                barrier.wait();

                assert!(registry.register(&path).expect("register should work"));
                assert!(registry
                    .should_ignore(&path)
                    .expect("should_ignore should work"));

                if index % 2 == 0 {
                    assert!(registry.unregister(&path).expect("unregister should work"));
                }
            })
        })
        .collect::<Vec<_>>();

    for handle in handles {
        handle.join().expect("thread should not panic");
    }

    assert_eq!(
        THREAD_COUNT / 2,
        registry.len().expect("registry should be readable")
    );

    for index in 0..THREAD_COUNT {
        let path = PathBuf::from(format!("tasks/{index}.md"));
        let should_ignore = registry
            .should_ignore(path)
            .expect("registry should be readable");

        assert_eq!(index % 2 == 1, should_ignore);
    }
}

#[test]
fn clear_on_empty_registry_returns_ok() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .clear()
        .expect("clear on empty registry should be Ok");
    assert!(registry.is_empty().expect("registry should be readable"));
}

#[test]
fn clear_removes_all_registered_paths() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register("tasks/a.md")
        .expect("registry should be writable");
    registry
        .register("tasks/b.md")
        .expect("registry should be writable");
    registry
        .register("tasks/c.md")
        .expect("registry should be writable");
    assert_eq!(3, registry.len().expect("registry should be readable"));

    registry.clear().expect("clear should succeed");

    assert_eq!(0, registry.len().expect("registry should be readable"));
    assert!(registry.is_empty().expect("registry should be readable"));
    assert!(!registry
        .should_ignore("tasks/a.md")
        .expect("registry should be readable"));
}

#[test]
fn clear_allows_subsequent_register_and_should_ignore() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register("tasks/a.md")
        .expect("registry should be writable");
    registry.clear().expect("clear should succeed");

    assert!(registry
        .register("tasks/a.md")
        .expect("registry should be writable"));
    assert!(registry
        .should_ignore("tasks/a.md")
        .expect("registry should be readable"));
}

#[test]
fn clear_returns_error_when_lock_is_poisoned() {
    let registry = Arc::new(WriteIgnoreRegistry::new());
    let poisoned_registry = Arc::clone(&registry);

    let handle = thread::spawn(move || {
        let _guard = poisoned_registry
            .ignored_paths
            .lock()
            .expect("registry should be lockable before poison");

        panic!("poison write_ignore registry lock");
    });

    assert!(handle.join().is_err());
    assert_eq!(
        WriteIgnoreError::LockPoisoned,
        registry
            .clear()
            .expect_err("poisoned lock should be reported")
    );
}

#[test]
fn register_bulk_inserts_all_paths_in_one_lock() {
    let registry = WriteIgnoreRegistry::new();
    let paths = vec![
        PathBuf::from("tasks/a.md"),
        PathBuf::from("tasks/b.md"),
        PathBuf::from("tasks/c.md"),
    ];

    registry
        .register_bulk(&paths)
        .expect("register_bulk should succeed");

    assert_eq!(3, registry.len().expect("registry should be readable"));
    for path in &paths {
        assert!(registry
            .should_ignore(path)
            .expect("registry should be readable"));
    }
}

#[test]
fn register_bulk_with_duplicates_within_input_is_idempotent() {
    let registry = WriteIgnoreRegistry::new();
    let paths = vec![
        PathBuf::from("tasks/a.md"),
        PathBuf::from("tasks/a.md"),
        PathBuf::from("tasks/b.md"),
    ];

    registry
        .register_bulk(&paths)
        .expect("register_bulk should succeed");

    assert_eq!(2, registry.len().expect("registry should be readable"));
}

#[test]
fn register_bulk_empty_slice_returns_ok() {
    let registry = WriteIgnoreRegistry::new();

    registry
        .register_bulk(&[])
        .expect("register_bulk on empty input should be Ok");

    assert!(registry.is_empty().expect("registry should be readable"));
}

#[test]
fn register_bulk_returns_lock_poisoned_when_mutex_poisoned() {
    let registry = Arc::new(WriteIgnoreRegistry::new());
    let poisoned_registry = Arc::clone(&registry);

    let handle = thread::spawn(move || {
        let _guard = poisoned_registry
            .ignored_paths
            .lock()
            .expect("registry should be lockable before poison");

        panic!("poison write_ignore registry lock");
    });

    assert!(handle.join().is_err());

    let paths = vec![PathBuf::from("tasks/a.md")];
    assert_eq!(
        WriteIgnoreError::LockPoisoned,
        registry
            .register_bulk(&paths)
            .expect_err("poisoned lock should be reported")
    );
}

#[test]
fn returns_error_when_lock_is_poisoned() {
    let registry = Arc::new(WriteIgnoreRegistry::new());
    let poisoned_registry = Arc::clone(&registry);

    let handle = thread::spawn(move || {
        let _guard = poisoned_registry
            .ignored_paths
            .lock()
            .expect("registry should be lockable before poison");

        panic!("poison write_ignore registry lock");
    });

    assert!(handle.join().is_err());
    assert_eq!(
        WriteIgnoreError::LockPoisoned,
        registry
            .should_ignore("tasks/example.md")
            .expect_err("poisoned lock should be reported")
    );
}
