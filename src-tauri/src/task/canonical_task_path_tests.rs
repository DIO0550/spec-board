use std::collections::HashMap;
use std::path::Path;

use super::CanonicalTaskPath;
use crate::task::task_file_path::TaskFilePath;

#[test]
fn new_keeps_already_canonical_path_unchanged() {
    assert_eq!(CanonicalTaskPath::new("tasks/a.md").as_str(), "tasks/a.md");
}

#[test]
fn new_folds_notation_variants_into_same_value() {
    let cases = [
        "./tasks/a.md",
        "tasks/./a.md",
        "tasks//a.md",
        "tasks\\a.md",
        "C:/tasks/a.md",
        "C:\\tasks\\a.md",
    ];
    let canonical = CanonicalTaskPath::new("tasks/a.md");
    for raw in cases {
        assert_eq!(
            CanonicalTaskPath::new(raw),
            canonical,
            "`{raw}` should normalize to `tasks/a.md`"
        );
    }
}

#[test]
fn from_file_path_and_from_path_agree_with_new() {
    let file_path = TaskFilePath::from_lenient("./tasks/a.md");
    assert_eq!(
        CanonicalTaskPath::from_file_path(&file_path),
        CanonicalTaskPath::new("tasks/a.md")
    );
    assert_eq!(
        CanonicalTaskPath::from_path(Path::new("tasks/./a.md")),
        CanonicalTaskPath::new("tasks/a.md")
    );
}

#[test]
fn new_is_idempotent() {
    let once = CanonicalTaskPath::new("./tasks/a.md");
    let twice = CanonicalTaskPath::new(once.as_str());
    assert_eq!(once, twice);
}

#[test]
fn new_with_empty_input_yields_empty_value() {
    assert!(CanonicalTaskPath::new("").is_empty());
}

#[test]
fn variants_hash_to_the_same_map_entry() {
    let mut map: HashMap<CanonicalTaskPath, u8> = HashMap::new();
    map.insert(CanonicalTaskPath::new("./tasks/a.md"), 1);
    assert_eq!(map.get(&CanonicalTaskPath::new("tasks\\a.md")), Some(&1));
    assert_eq!(map.len(), 1);
}
