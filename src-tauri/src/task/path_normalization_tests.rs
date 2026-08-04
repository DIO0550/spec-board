use super::{contains_parent_dir, has_windows_drive_prefix, normalize_path_parts};

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

#[test]
fn keeps_non_drive_segment_ending_with_colon_on_unix() {
    // `notes:` のような ASCII 文字数 != 2 の末尾コロン文字列は drive prefix
    // ではないため削除しない（Unix で正規ディレクトリ名として有効）。
    assert_eq!(normalize_path_parts("notes:/foo.md", true), "notes:/foo.md");
}

#[test]
fn detects_parent_dir_segment() {
    assert!(contains_parent_dir("a/../b.md"));
    assert!(contains_parent_dir("../b.md"));
    assert!(contains_parent_dir(".."));
    assert!(!contains_parent_dir("a/b.md"));
    assert!(!contains_parent_dir(""));
}

#[test]
fn does_not_treat_dot_dot_prefixed_name_as_parent_dir() {
    // `..foo` は親ディレクトリ参照ではなく、先頭がドット 2 つのファイル名。
    assert!(!contains_parent_dir("..foo/b.md"));
    assert!(!contains_parent_dir("a/...md"));
}

#[test]
fn drive_prefix_only_removed_at_start() {
    // 先頭セグメント以外は drive prefix 形式でも削除しない。
    assert_eq!(
        normalize_path_parts("tasks/C:/foo.md", true),
        "tasks/C:/foo.md"
    );
}
