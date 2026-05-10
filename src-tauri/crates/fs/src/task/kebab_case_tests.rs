use super::*;

// ── ASCII のみ ────────────────────────────────────────────────

#[test]
fn to_kebab_case_basic_ascii_cases() {
    let cases: Vec<(&str, &str, &str)> = vec![
        ("Fix Login Bug", "fix-login-bug", "general ascii"),
        ("FOO", "foo", "uppercase only"),
        ("foo--bar", "foo-bar", "consecutive hyphens collapse"),
        (
            "  Fix login!! bug  ",
            "fix-login-bug",
            "trim and collapse symbols",
        ),
        (
            "Hello_World.md",
            "hello-world-md",
            "underscore and dot are separators",
        ),
    ];

    for (input, expected, label) in cases {
        assert_eq!(to_kebab_case(input), expected, "{label}");
    }
}

// ── mixed / 全非 ASCII ────────────────────────────────────────

#[test]
fn to_kebab_case_non_ascii_cases() {
    let cases: Vec<(&str, &str, &str)> = vec![
        ("タスク 1", "タスク-1", "mixed: cjk + ascii"),
        ("Fix バグ", "fix-バグ", "mixed: ascii first + cjk"),
        ("日本語 title", "日本語-title", "mixed: cjk + ascii word"),
        ("バグ修正", "バグ修正", "all non-ascii passthrough"),
    ];

    for (input, expected, label) in cases {
        assert_eq!(to_kebab_case(input), expected, "{label}");
    }
}

// ── 空 / 記号のみ ─────────────────────────────────────────────

#[test]
fn to_kebab_case_empty_cases() {
    let cases: Vec<(&str, &str, &str)> = vec![
        ("", "", "empty input"),
        ("!!!", "", "all symbols collapse to empty"),
    ];

    for (input, expected, label) in cases {
        assert_eq!(to_kebab_case(input), expected, "{label}");
    }
}
