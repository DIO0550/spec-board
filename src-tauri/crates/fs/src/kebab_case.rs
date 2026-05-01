//! タスクタイトル文字列から、ファイル名として利用する kebab-case
//! 文字列を生成する純粋関数を提供するモジュール。
//!
//! # 変換ルール
//!
//! - 入力が ASCII 文字を 1 つも含まない場合は、入力をそのまま返す
//!   （日本語のみのタイトルは保持する）。
//! - ASCII を 1 文字でも含む場合は以下を適用する。
//!   - ASCII 英大文字は小文字化する。
//!   - ASCII 英数字 `[a-z0-9]` 以外の ASCII 文字（スペース・記号・
//!     アンダースコア・ドット等）はすべて区切りに置換する。
//!   - 非 ASCII 文字（日本語など）はそのまま保持する。
//!   - 区切りと既存ハイフンの連続は 1 個のハイフンに集約する。
//!   - 先頭・末尾のハイフンは除去する。
//! - 空入力、または変換後に空文字列となる入力では、空文字列を返す。
//!   デフォルト名フォールバックは行わない。
//!
//! 拡張子 `.md` の付与や重複回避サフィックスは本関数の責務外であり、
//! 呼び出し側で付与する。

/// タスクタイトル文字列から kebab-case のファイル名文字列を生成する。
///
/// `title` が空 / 変換後に空となる場合は空文字列を返す。
pub fn to_kebab_case(title: &str) -> String {
    if !title.chars().any(|c| c.is_ascii()) {
        return title.to_string();
    }

    let mut out = String::with_capacity(title.len());
    let mut last_was_separator = true;
    for ch in title.chars() {
        if ch.is_ascii() {
            if ch.is_ascii_alphanumeric() {
                out.push(ch.to_ascii_lowercase());
                last_was_separator = false;
            } else if !last_was_separator {
                out.push('-');
                last_was_separator = true;
            }
        } else {
            out.push(ch);
            last_was_separator = false;
        }
    }

    if out.ends_with('-') {
        out.pop();
    }

    out
}

#[cfg(test)]
mod tests {
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
}
