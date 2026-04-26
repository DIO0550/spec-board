use serde::Deserialize;
use std::borrow::Cow;
use std::collections::HashMap;
use thiserror::Error;

/// タスク md ファイルのフロントマター。
///
/// 本 Issue では typed フィールドを定義せず、全 YAML キーを `extras` に保持する。
/// 後続 Issue で `title` / `status` 等の typed フィールドを追加した際、
/// それ以外のキーが `extras` に残る `#[serde(flatten)]` 構造を維持する (PL-012)。
#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
pub struct Frontmatter {
    #[serde(flatten)]
    pub extras: HashMap<String, serde_yaml_ng::Value>,
}

/// `parse` の成功時返却値。フロントマターと本文を分離して保持する。
#[derive(Debug, Clone, PartialEq)]
pub struct Parsed {
    pub frontmatter: Frontmatter,
    pub body: String,
}

/// フロントマター解析時のエラー。
#[derive(Debug, Error)]
pub enum FrontmatterError {
    /// YAML 構文エラー、または YAML ルートが mapping でない場合 (PL-002)。
    #[error("invalid YAML in frontmatter: {0}")]
    InvalidYaml(#[from] serde_yaml_ng::Error),
}

/// 入力文字列から frontmatter を抽出してパースする。
///
/// # 区切り検出 (PL-001)
/// frontmatter は **「先頭行が `---`（末尾空白許容）から、続く最初の単独行 `---` まで」**
/// と定義する。先頭 `---` 以降に現れる最初の単独行 `---` は常に closing delimiter とみなす
/// （本文中に偶発的に `---` が含まれる場合も区切りとして解釈される）。
/// YAML document end marker `...` は区切りとして扱わない。
///
/// # 戻り値
/// - フロントマターが存在しない場合: `Ok(None)` (BL-003)
///   - 先頭行が `---` でない / 2 つ目の単独行 `---` が見つからない 場合を含む
/// - YAML パース失敗時: `Err(FrontmatterError::InvalidYaml)` (PL-002)
///   - YAML 構文エラー / ルートが mapping でない (sequence / scalar / null) を含む
/// - 成功時: 未知フィールドを含む `Ok(Some(Parsed))` (PL-001 / PL-012)
///
/// # 入力前処理
/// - 先頭の BOM (U+FEFF) を 1 個だけ除去（中間に現れる U+FEFF は触らない）
/// - CRLF (`\r\n`) を LF (`\n`) に正規化
pub fn parse(input: &str) -> Result<Option<Parsed>, FrontmatterError> {
    let normalized = normalize(input);
    let Some((yaml_text, body)) = split_frontmatter(&normalized) else {
        return Ok(None);
    };
    let frontmatter: Frontmatter = if yaml_text.trim().is_empty() {
        Frontmatter::default()
    } else {
        serde_yaml_ng::from_str(&yaml_text)?
    };
    Ok(Some(Parsed { frontmatter, body }))
}

/// 先頭の BOM (U+FEFF) を 1 個除去し、CRLF を LF に正規化する。
/// 中間に現れる U+FEFF は触らない。
///
/// BOM も CRLF も含まない場合は入力をそのままボローし、不要なアロケーションを避ける。
fn normalize(input: &str) -> Cow<'_, str> {
    let stripped = input.strip_prefix('\u{FEFF}').unwrap_or(input);
    if stripped.contains("\r\n") {
        Cow::Owned(stripped.replace("\r\n", "\n"))
    } else {
        Cow::Borrowed(stripped)
    }
}

/// 区切り行判定。`---` のみを区切りとし、末尾空白を許容する。
/// YAML document end marker `...` は区切りとして扱わない。
fn is_fence(line: &str) -> bool {
    line.trim_end() == "---"
}

/// 先頭行が `---` であり、それ以降に最初の単独行 `---` が存在する場合のみ
/// `(yaml_text, body)` を返す。それ以外は `None`。
///
/// `yaml_text` は open/close の区切り行を含まない。
/// `body` は close 行の次行以降を文字列として返す（末尾改行は入力のまま）。
fn split_frontmatter(input: &str) -> Option<(String, String)> {
    let mut lines = input.split('\n');
    let first = lines.next()?;
    if !is_fence(first) {
        return None;
    }

    let mut yaml_lines: Vec<&str> = Vec::new();
    let mut found_close = false;
    let mut body_parts: Vec<&str> = Vec::new();

    for line in lines.by_ref() {
        if !found_close && is_fence(line) {
            found_close = true;
            continue;
        }
        if found_close {
            body_parts.push(line);
        } else {
            yaml_lines.push(line);
        }
    }

    if !found_close {
        return None;
    }

    let yaml_text = yaml_lines.join("\n");
    let body = body_parts.join("\n");
    Some((yaml_text, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    // ─────────────────────────────────────────────────────────
    // Ok(None) 系（フロントマター不在）：BL-003 / Cycle 1, 5, 12-1
    // ─────────────────────────────────────────────────────────
    #[test]
    fn returns_none_when_no_frontmatter() {
        let cases: Vec<(&str, &str)> = vec![
            ("# heading\nbody", "Cycle 1: 先頭が --- でない"),
            (
                "---\ntitle: A\n本文に --- が含まれない\n",
                "Cycle 5: 2 つ目の --- が欠落",
            ),
            (
                "---\ntitle: A\n...\nbody\n",
                "Cycle 12-1: ... は closing delimiter として扱わず、---が無い",
            ),
            ("", "空入力"),
        ];

        for (input, label) in cases {
            let got = parse(input);
            assert!(
                matches!(got, Ok(None)),
                "{label}: expected Ok(None), got {got:?}"
            );
        }
    }

    // ─────────────────────────────────────────────────────────
    // Ok(Some) 系（正常パース）
    // ─────────────────────────────────────────────────────────
    #[test]
    fn cycle2_minimum_title_and_status() {
        let input = "---\ntitle: A\nstatus: TODO\n---\nbody text\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.extras.len(), 2);
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into()))
        );
        assert_eq!(
            parsed.frontmatter.extras.get("status"),
            Some(&serde_yaml_ng::Value::String("TODO".into()))
        );
        assert_eq!(parsed.body, "body text\n");
    }

    #[test]
    fn cycle3_unknown_fields_preserved_in_extras() {
        let input = "---\nfoo: 1\nbar: [a, b]\n---\n";
        let parsed = parse(input).unwrap().unwrap();
        assert!(parsed.frontmatter.extras.contains_key("foo"));
        assert!(parsed.frontmatter.extras.contains_key("bar"));
        assert_eq!(parsed.frontmatter.extras.len(), 2);
    }

    #[test]
    fn cycle6_empty_frontmatter_returns_default_frontmatter() {
        let input = "---\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert!(parsed.frontmatter.extras.is_empty());
        assert_eq!(parsed.body, "body\n");
    }

    #[test]
    fn cycle7_empty_body() {
        let input = "---\ntitle: A\n---\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into()))
        );
        assert_eq!(parsed.body, "");
    }

    #[test]
    fn cycle8_strips_leading_bom() {
        let input = "\u{FEFF}---\ntitle: A\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into()))
        );
        assert_eq!(parsed.body, "body\n");
    }

    #[test]
    fn cycle9_normalizes_crlf_to_lf() {
        let input = "---\r\ntitle: A\r\nstatus: TODO\r\n---\r\nbody\r\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into()))
        );
        assert_eq!(
            parsed.frontmatter.extras.get("status"),
            Some(&serde_yaml_ng::Value::String("TODO".into()))
        );
        assert_eq!(parsed.body, "body\n");
    }

    #[test]
    fn cycle10_allows_trailing_whitespace_on_fence() {
        let input = "--- \ntitle: A\n--- \nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into()))
        );
        assert_eq!(parsed.body, "body\n");
    }

    #[test]
    fn cycle12_2_dot_dot_dot_is_not_treated_as_fence() {
        // ... は区切りとして扱わず、続く --- を closing とみなす。
        let input = "---\ntitle: A\n...\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into()))
        );
        assert_eq!(parsed.body, "body\n");
    }

    // ─────────────────────────────────────────────────────────
    // Err 系（PL-002）：Cycle 4, 11
    // ─────────────────────────────────────────────────────────
    #[test]
    fn returns_invalid_yaml_for_malformed_or_non_mapping_root() {
        let cases: Vec<(&str, &str)> = vec![
            (
                "---\nkey: : invalid\n---\nbody\n",
                "Cycle 4: 不正 YAML 構文",
            ),
            ("---\n[a, b]\n---\nbody\n", "Cycle 11-1: ルートが sequence"),
            ("---\n42\n---\nbody\n", "Cycle 11-2: ルートが scalar"),
            ("---\nnull\n---\nbody\n", "Cycle 11-3: ルートが null"),
        ];

        for (input, label) in cases {
            let got = parse(input);
            assert!(
                matches!(got, Err(FrontmatterError::InvalidYaml(_))),
                "{label}: expected Err(InvalidYaml), got {got:?}"
            );
        }
    }
}
