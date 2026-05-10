use super::*;

fn set(values: &[&'static str]) -> HashSet<&'static str> {
    values.iter().copied().collect()
}

// ── 衝突なし ──────────────────────────────────────────────────

#[test]
fn build_unique_filename_no_collision_cases() {
    let cases: Vec<(&str, &str, HashSet<&'static str>, &str, &str)> = vec![(
        "foo",
        "md",
        set(&[]),
        "foo.md",
        "no collision, empty existing",
    )];

    for (base, ext, existing, expected, label) in cases {
        assert_eq!(
            build_unique_filename(base, ext, &existing),
            expected,
            "{label}"
        );
    }
}

// ── 1 件衝突 ──────────────────────────────────────────────────

#[test]
fn build_unique_filename_single_collision_cases() {
    let cases: Vec<(&str, &str, HashSet<&'static str>, &str, &str)> = vec![(
        "foo",
        "md",
        set(&["foo.md"]),
        "foo-1.md",
        "single collision",
    )];

    for (base, ext, existing, expected, label) in cases {
        assert_eq!(
            build_unique_filename(base, ext, &existing),
            expected,
            "{label}"
        );
    }
}

// ── 末尾数字 base ─────────────────────────────────────────────

#[test]
fn build_unique_filename_numeric_suffix_base_cases() {
    let cases: Vec<(&str, &str, HashSet<&'static str>, &str, &str)> = vec![(
        "task-1",
        "md",
        set(&["task-1.md"]),
        "task-1-1.md",
        "trailing-number base is treated as opaque string",
    )];

    for (base, ext, existing, expected, label) in cases {
        assert_eq!(
            build_unique_filename(base, ext, &existing),
            expected,
            "{label}"
        );
    }
}

// ── 拡張子なし ────────────────────────────────────────────────

#[test]
fn build_unique_filename_empty_ext_cases() {
    let cases: Vec<(&str, &str, HashSet<&'static str>, &str, &str)> = vec![
        ("foo", "", set(&[]), "foo", "empty ext, no collision"),
        (
            "foo",
            "",
            set(&["foo"]),
            "foo-1",
            "empty ext, single collision",
        ),
    ];

    for (base, ext, existing, expected, label) in cases {
        assert_eq!(
            build_unique_filename(base, ext, &existing),
            expected,
            "{label}"
        );
    }
}

// ── 連番探索 ──────────────────────────────────────────────────

#[test]
fn build_unique_filename_multiple_collision_cases() {
    let cases: Vec<(&str, &str, HashSet<&'static str>, &str, &str)> = vec![
        (
            "foo",
            "md",
            set(&["foo.md", "foo-1.md"]),
            "foo-2.md",
            "two consecutive collisions yield -2",
        ),
        (
            "foo",
            "md",
            set(&["foo.md", "foo-2.md"]),
            "foo-1.md",
            "gap collision yields earliest free slot -1",
        ),
    ];

    for (base, ext, existing, expected, label) in cases {
        assert_eq!(
            build_unique_filename(base, ext, &existing),
            expected,
            "{label}"
        );
    }
}

// ── エッジ ────────────────────────────────────────────────────

#[test]
fn build_unique_filename_edge_cases() {
    let cases: Vec<(&str, &str, HashSet<&'static str>, &str, &str)> = vec![
        (
            "foo",
            "md",
            set(&["FOO.md"]),
            "foo.md",
            "case-sensitive comparison: FOO.md does not collide with foo.md",
        ),
        (
            "foo",
            "md",
            set(&["other.md", "another.md"]),
            "foo.md",
            "unrelated entries do not affect candidate",
        ),
        (
            "foo.bar",
            "md",
            set(&["foo.bar.md"]),
            "foo.bar-1.md",
            "dot inside base is treated as opaque",
        ),
    ];

    for (base, ext, existing, expected, label) in cases {
        assert_eq!(
            build_unique_filename(base, ext, &existing),
            expected,
            "{label}"
        );
    }
}

// ── ジェネリック互換性 ────────────────────────────────────────

#[test]
fn build_unique_filename_accepts_owned_string_set() {
    let existing: HashSet<String> = ["foo.md".to_string()].into_iter().collect();
    assert_eq!(build_unique_filename("foo", "md", &existing), "foo-1.md");
}
