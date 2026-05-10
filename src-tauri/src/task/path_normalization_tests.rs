use super::{has_windows_drive_prefix, normalize_path_parts};

#[test]
fn replaces_backslash_to_slash_via_caller_then_normalizes() {
    // 呼び出し側で `\\` → `/` に置換済みの想定でテストする。
    let raw = "tasks\\foo.md".replace('\\', "/");
    assert_eq!(normalize_path_parts(&raw, true), "tasks/foo.md");
}

#[test]
fn removes_dot_segment() {
    assert_eq!(normalize_path_parts("./tasks/foo.md", true), "tasks/foo.md");
    assert_eq!(normalize_path_parts("tasks/./foo.md", true), "tasks/foo.md");
}

#[test]
fn removes_drive_prefix_when_flag_true() {
    assert_eq!(
        normalize_path_parts("C:/tasks/foo.md", true),
        "tasks/foo.md"
    );
}

#[test]
fn keeps_drive_prefix_segments_when_flag_false() {
    assert_eq!(
        normalize_path_parts("C:/tasks/foo.md", false),
        "C:/tasks/foo.md"
    );
}

#[test]
fn collapses_consecutive_slashes() {
    assert_eq!(normalize_path_parts("tasks//foo.md", true), "tasks/foo.md");
}

#[test]
fn drops_leading_and_trailing_empty_segments() {
    assert_eq!(normalize_path_parts("/tasks/foo.md", true), "tasks/foo.md");
    assert_eq!(normalize_path_parts("tasks/foo.md/", true), "tasks/foo.md");
}

#[test]
fn detects_windows_drive_prefix() {
    assert!(has_windows_drive_prefix("C:/foo.md"));
    assert!(has_windows_drive_prefix("d:foo.md"));
    assert!(!has_windows_drive_prefix("/foo.md"));
    assert!(!has_windows_drive_prefix("c"));
    assert!(!has_windows_drive_prefix(""));
}
