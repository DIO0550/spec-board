use serde::{Deserialize, Deserializer};
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use thiserror::Error;

/// タスクの優先度。`docs/spec-board/task-format-spec.md` PL-005 に従い、
/// YAML フロントマターの `priority` 値を ASCII 大小文字非区別で正規化したもの。
///
/// 未定義文字列（例: `urgent`）や型不一致（数値・配列・mapping・null・bool）は
/// `Frontmatter::priority` 上で `None` として表現される（バッジ非表示扱い）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    High,
    Medium,
    Low,
}

impl Priority {
    /// ASCII 大小文字を区別せずに `"high"` / `"medium"` / `"low"` を
    /// `Priority` バリアントへ正規化する。それ以外の文字列は `None`。
    ///
    /// `trim` は行わない（YAML パーサ側で通常 trim 済みのため、引用符付きで
    /// 前後空白を含む値などはここで弾く）。
    pub(crate) fn from_ascii_ci(s: &str) -> Option<Self> {
        if s.eq_ignore_ascii_case("high") {
            return Some(Self::High);
        }
        if s.eq_ignore_ascii_case("medium") {
            return Some(Self::Medium);
        }
        if s.eq_ignore_ascii_case("low") {
            return Some(Self::Low);
        }
        None
    }
}

/// タスク md ファイルのフロントマター。
///
/// `priority` は PL-005 に従い `Priority` enum に正規化された typed フィールド。
/// 値が未定義文字列・型不一致・null・キー不在の場合はすべて `None`（バッジ非表示）。
///
/// `labels` (PL-006) / `links` (PL-009 前段) は共通 lenient deserializer により
/// `Vec<String>` に正規化される typed フィールド。単一文字列は 1 要素配列に変換され、
/// 配列は要素単位 lenient + 重複除去（first-occurrence wins）される。型不一致や
/// キー不在の場合は `vec![]`。空文字列要素は保持する（trim しない）。
///
/// `priority` / `labels` / `links` 以外の YAML キーは `extras` に
/// `serde_yaml_ng::Value` として保持される (PL-012)。
#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
pub struct Frontmatter {
    /// 優先度（PL-005）。値が無い・未定義文字列・型不一致のいずれも `None`。
    #[serde(default, deserialize_with = "deserialize_priority_lenient")]
    pub priority: Option<Priority>,
    /// ラベルの配列（PL-006）。単一文字列は 1 要素配列に変換 + 重複除去（first-occurrence wins）。
    /// 型不一致や要素単位の非文字列はすべて除外し、エラー化しない。
    #[serde(default, deserialize_with = "deserialize_string_vec_lenient")]
    pub labels: Vec<String>,
    /// 関連タスクのファイルパス配列（PL-009 前段）。labels と同じ正規化ロジックを共有。
    /// PL-009 末尾「存在しないパスは警告付きで保持」は別 Issue（PL-010 逆引きインデックスとセット想定）。
    #[serde(default, deserialize_with = "deserialize_string_vec_lenient")]
    pub links: Vec<String>,
    #[serde(flatten)]
    pub extras: HashMap<String, serde_yaml_ng::Value>,
}

/// `priority` フィールド用の lenient deserializer。
///
/// `serde_yaml_ng::Value::deserialize` で一度 `Value` を受け取り、
/// `Value::String(s)` のみを `Priority::from_ascii_ci` で正規化する。
/// 数値・配列・mapping・null・bool など型不一致はすべて `Ok(None)` に落とす。
///
/// `priority` 値の型不一致や未定義文字列で `FrontmatterError::InvalidYaml` 化することはない (PL-005)。
fn deserialize_priority_lenient<'de, D>(deserializer: D) -> Result<Option<Priority>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_yaml_ng::Value::deserialize(deserializer)?;
    let serde_yaml_ng::Value::String(s) = value else {
        return Ok(None);
    };
    Ok(Priority::from_ascii_ci(&s))
}

/// `labels` / `links` フィールド用の共通 lenient deserializer (PL-006 / PL-009 前段)。
///
/// `serde_yaml_ng::Value::deserialize` で一度 `Value` を受け取り、以下の 3 分岐で正規化する:
///
/// 1. `Value::String(s)` → `vec![s]`（単一文字列を 1 要素配列に変換、空文字列も保持）
/// 2. `Value::Sequence(items)` → 要素単位 lenient + 重複除去
///    - 各要素を `Value::String` で受けて採用、それ以外は `continue` でスキップ
///    - `HashSet<String>` で検出済み管理、first-occurrence wins で順序保持
/// 3. それ以外（`Number` / `Bool` / `Null` / `Mapping` / `Tagged`）→ `Vec::new()`
///
/// この関数は `Err` を返さない設計（`Value::deserialize` 自体の失敗は除く）。
/// `labels` / `links` 値の異常で `FrontmatterError::InvalidYaml` 化することはない。
///
/// `trim` / case 正規化は行わない。生データを尊重する。
///
/// NOTE: PL-009 末尾「存在しないパスは警告付きで保持」は本 Issue スコープ外。
///       別 Issue（PL-010 逆引きインデックスとセット想定）で実装する。
fn deserialize_string_vec_lenient<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_yaml_ng::Value::deserialize(deserializer)?;
    match value {
        serde_yaml_ng::Value::String(s) => Ok(vec![s]),
        serde_yaml_ng::Value::Sequence(items) => {
            let mut seen: HashSet<String> = HashSet::with_capacity(items.len());
            let mut out: Vec<String> = Vec::with_capacity(items.len());
            for item in items {
                let serde_yaml_ng::Value::String(s) = item else {
                    continue;
                };
                if seen.insert(s.clone()) {
                    out.push(s);
                }
            }
            Ok(out)
        }
        _ => Ok(Vec::new()),
    }
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
/// - 成功時: typed `priority` / `labels` / `links` を含む `Ok(Some(Parsed))`
///   (PL-001 / PL-005 / PL-006 / PL-009 / PL-012)
///   - `priority` は ASCII 大小文字非区別で正規化される
///   - `labels` / `links` は単一文字列 → 1 要素配列、配列要素単位 lenient、
///     重複除去（first-occurrence wins）。型不一致・キー不在はすべて `vec![]`
///   - 未定義文字列・型不一致・null・キー不在の priority はすべて `None`
///
/// # 入力前処理
/// - 先頭の BOM (U+FEFF) を 1 個だけ除去（中間に現れる U+FEFF は触らない）
/// - CRLF (`\r\n`) を LF (`\n`) に正規化
pub fn parse(input: &str) -> Result<Option<Parsed>, FrontmatterError> {
    let normalized = normalize(input);
    let Some((yaml_text, body)) = split_frontmatter(&normalized) else {
        return Ok(None);
    };
    let frontmatter: Frontmatter = (!yaml_text.trim().is_empty())
        .then(|| serde_yaml_ng::from_str::<Frontmatter>(&yaml_text))
        .transpose()?
        .unwrap_or_default();
    Ok(Some(Parsed { frontmatter, body }))
}

/// 先頭の BOM (U+FEFF) を 1 個除去し、CRLF を LF に正規化する。
/// 中間に現れる U+FEFF は触らない。
///
/// BOM も CRLF も含まない場合は入力をそのままボローし、不要なアロケーションを避ける。
fn normalize(input: &str) -> Cow<'_, str> {
    let stripped = input.strip_prefix('\u{FEFF}').unwrap_or(input);
    if !stripped.contains("\r\n") {
        return Cow::Borrowed(stripped);
    }
    Cow::Owned(stripped.replace("\r\n", "\n"))
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
    let lines: Vec<&str> = input.split('\n').collect();
    let (first, rest) = lines.split_first()?;
    if !is_fence(first) {
        return None;
    }

    let close_idx = rest.iter().position(|l| is_fence(l))?;
    let (yaml_lines, after) = rest.split_at(close_idx);
    let body_parts = &after[1..];

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
    // Priority 系（PL-005）：Cycle 13〜20
    // ─────────────────────────────────────────────────────────
    #[test]
    fn priority_normalizes_case_insensitively() {
        let cases: Vec<(&str, Priority, &str)> = vec![
            ("---\npriority: high\n---\n", Priority::High, "high"),
            ("---\npriority: HIGH\n---\n", Priority::High, "HIGH"),
            ("---\npriority: High\n---\n", Priority::High, "High"),
            ("---\npriority: medium\n---\n", Priority::Medium, "medium"),
            ("---\npriority: MEDIUM\n---\n", Priority::Medium, "MEDIUM"),
            ("---\npriority: Medium\n---\n", Priority::Medium, "Medium"),
            ("---\npriority: low\n---\n", Priority::Low, "low"),
            ("---\npriority: LOW\n---\n", Priority::Low, "LOW"),
            ("---\npriority: Low\n---\n", Priority::Low, "Low"),
        ];

        for (input, expected, label) in cases {
            let parsed = parse(input).unwrap().unwrap();
            assert_eq!(parsed.frontmatter.priority, Some(expected), "{label}");
        }
    }

    #[test]
    fn priority_is_none_when_key_absent() {
        let input = "---\ntitle: A\nstatus: TODO\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.priority, None);
    }

    #[test]
    fn priority_falls_back_to_none_for_unknown_string() {
        let cases: Vec<(&str, &str)> = vec![
            ("---\npriority: urgent\n---\n", "未定義文字列 urgent"),
            ("---\npriority: high!!\n---\n", "未定義文字列 high!!"),
            ("---\npriority: \"\"\n---\n", "空文字列"),
            (
                "---\npriority: None\n---\n",
                "\"None\" 文字列（task-format-spec.md 行 68 と整合）",
            ),
        ];

        for (input, label) in cases {
            let parsed = parse(input).unwrap().unwrap();
            assert_eq!(parsed.frontmatter.priority, None, "{label}");
        }
    }

    #[test]
    fn priority_falls_back_to_none_for_typed_mismatch() {
        let cases: Vec<(&str, &str)> = vec![
            ("---\npriority: 1\n---\n", "型不一致 数値"),
            ("---\npriority: [a, b]\n---\n", "型不一致 配列"),
            ("---\npriority: {level: high}\n---\n", "型不一致 mapping"),
            ("---\npriority: null\n---\n", "型不一致 null"),
            ("---\npriority: true\n---\n", "型不一致 bool"),
        ];

        for (input, label) in cases {
            let got = parse(input);
            assert!(
                matches!(got, Ok(Some(_))),
                "{label}: expected Ok(Some(_)), got {got:?}"
            );
            assert_eq!(got.unwrap().unwrap().frontmatter.priority, None, "{label}");
        }
    }

    #[test]
    fn priority_is_excluded_from_extras_when_typed() {
        let input = "---\ntitle: A\nstatus: TODO\npriority: High\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.priority, Some(Priority::High));
        assert!(!parsed.frontmatter.extras.contains_key("priority"));
        assert_eq!(parsed.frontmatter.extras.len(), 2);
        assert!(parsed.frontmatter.extras.contains_key("title"));
        assert!(parsed.frontmatter.extras.contains_key("status"));
    }

    #[test]
    fn priority_works_with_bom_and_crlf() {
        let input = "\u{FEFF}---\r\npriority: HIGH\r\n---\r\nbody\r\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.priority, Some(Priority::High));
        assert_eq!(parsed.body, "body\n");
    }

    #[test]
    fn priority_does_not_trim_quoted_string() {
        let input = "---\npriority: \" high \"\n---\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.priority, None,
            "前後空白を含む文字列は trim せず None"
        );
    }

    #[test]
    fn priority_duplicate_key_returns_invalid_yaml() {
        let input = "---\npriority: high\npriority: low\n---\n";
        let got = parse(input);
        assert!(
            matches!(got, Err(FrontmatterError::InvalidYaml(_))),
            "重複 priority キーは serde_yaml_ng の DuplicateKey 標準動作により InvalidYaml: got {got:?}"
        );
    }

    // ─────────────────────────────────────────────────────────
    // labels 系（PL-006）：Cycle 21〜26 + 35
    // ─────────────────────────────────────────────────────────
    #[test]
    fn labels_normalize_single_string_to_one_element_vec() {
        let cases: Vec<(&str, Vec<&str>, &str)> = vec![
            ("---\nlabels: bug\n---\n", vec!["bug"], "単一文字列 bug"),
            ("---\nlabels: \"\"\n---\n", vec![""], "空文字列保持"),
            (
                "---\nlabels: \" bug \"\n---\n",
                vec![" bug "],
                "前後空白も保持（trim しない）",
            ),
        ];

        for (input, expected, label) in cases {
            let parsed = parse(input).unwrap().unwrap();
            let want: Vec<String> = expected.into_iter().map(String::from).collect();
            assert_eq!(parsed.frontmatter.labels, want, "{label}");
        }
    }

    #[test]
    fn labels_dedup_preserves_first_occurrence_order() {
        let cases: Vec<(&str, Vec<&str>, &str)> = vec![
            ("---\nlabels: []\n---\n", vec![], "空配列"),
            (
                "---\nlabels: [bug, fix]\n---\n",
                vec!["bug", "fix"],
                "順序保持",
            ),
            (
                "---\nlabels: [bug, bug, fix]\n---\n",
                vec!["bug", "fix"],
                "重複除去",
            ),
            (
                "---\nlabels: [a, b, a, c, b]\n---\n",
                vec!["a", "b", "c"],
                "first-occurrence wins",
            ),
        ];

        for (input, expected, label) in cases {
            let parsed = parse(input).unwrap().unwrap();
            let want: Vec<String> = expected.into_iter().map(String::from).collect();
            assert_eq!(parsed.frontmatter.labels, want, "{label}");
        }
    }

    #[test]
    fn labels_falls_back_to_empty_vec_for_typed_mismatch() {
        let cases: Vec<(&str, &str)> = vec![
            ("---\nlabels: 1\n---\n", "型不一致 数値"),
            ("---\nlabels: true\n---\n", "型不一致 bool"),
            ("---\nlabels: null\n---\n", "型不一致 null"),
            ("---\nlabels: {a: 1}\n---\n", "型不一致 mapping"),
        ];

        for (input, label) in cases {
            let got = parse(input);
            assert!(
                matches!(got, Ok(Some(_))),
                "{label}: expected Ok(Some(_)), got {got:?}"
            );
            assert_eq!(
                got.unwrap().unwrap().frontmatter.labels,
                Vec::<String>::new(),
                "{label}"
            );
        }
    }

    #[test]
    fn labels_filter_non_string_elements_in_sequence() {
        let input = "---\nlabels: [\"a\", 1, \"b\", null, true]\n---\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.labels,
            vec!["a".to_string(), "b".to_string()]
        );
    }

    #[test]
    fn labels_is_empty_when_key_absent() {
        let input = "---\ntitle: A\nstatus: TODO\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.labels, Vec::<String>::new());
    }

    #[test]
    fn labels_is_excluded_from_extras_when_typed() {
        let input = "---\ntitle: A\nstatus: TODO\nlabels: [bug, fix]\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.labels,
            vec!["bug".to_string(), "fix".to_string()]
        );
        assert!(!parsed.frontmatter.extras.contains_key("labels"));
        assert_eq!(parsed.frontmatter.extras.len(), 2);
        assert!(parsed.frontmatter.extras.contains_key("title"));
        assert!(parsed.frontmatter.extras.contains_key("status"));
    }

    #[test]
    fn labels_duplicate_key_returns_invalid_yaml() {
        let input = "---\nlabels: a\nlabels: b\n---\n";
        let got = parse(input);
        assert!(
            matches!(got, Err(FrontmatterError::InvalidYaml(_))),
            "重複 labels キーは InvalidYaml: got {got:?}"
        );
    }

    // ─────────────────────────────────────────────────────────
    // links 系（PL-009 前段）：Cycle 27〜32 + 36
    // ─────────────────────────────────────────────────────────
    #[test]
    fn links_normalize_single_string_to_one_element_vec() {
        let cases: Vec<(&str, Vec<&str>, &str)> = vec![
            (
                "---\nlinks: tasks/foo.md\n---\n",
                vec!["tasks/foo.md"],
                "単一文字列パス",
            ),
            ("---\nlinks: \"\"\n---\n", vec![""], "空文字列保持"),
        ];

        for (input, expected, label) in cases {
            let parsed = parse(input).unwrap().unwrap();
            let want: Vec<String> = expected.into_iter().map(String::from).collect();
            assert_eq!(parsed.frontmatter.links, want, "{label}");
        }
    }

    #[test]
    fn links_dedup_preserves_first_occurrence_order() {
        let cases: Vec<(&str, Vec<&str>, &str)> = vec![
            ("---\nlinks: []\n---\n", vec![], "空配列"),
            (
                "---\nlinks: [tasks/a.md, tasks/b.md]\n---\n",
                vec!["tasks/a.md", "tasks/b.md"],
                "順序保持",
            ),
            (
                "---\nlinks: [tasks/a.md, tasks/a.md, tasks/b.md]\n---\n",
                vec!["tasks/a.md", "tasks/b.md"],
                "重複除去",
            ),
            (
                "---\nlinks: [a, b, a, c]\n---\n",
                vec!["a", "b", "c"],
                "first-occurrence wins",
            ),
        ];

        for (input, expected, label) in cases {
            let parsed = parse(input).unwrap().unwrap();
            let want: Vec<String> = expected.into_iter().map(String::from).collect();
            assert_eq!(parsed.frontmatter.links, want, "{label}");
        }
    }

    #[test]
    fn links_falls_back_to_empty_vec_for_typed_mismatch() {
        let cases: Vec<(&str, &str)> = vec![
            ("---\nlinks: 1\n---\n", "型不一致 数値"),
            ("---\nlinks: true\n---\n", "型不一致 bool"),
            ("---\nlinks: null\n---\n", "型不一致 null"),
            ("---\nlinks: {path: a}\n---\n", "型不一致 mapping"),
        ];

        for (input, label) in cases {
            let got = parse(input);
            assert!(
                matches!(got, Ok(Some(_))),
                "{label}: expected Ok(Some(_)), got {got:?}"
            );
            assert_eq!(
                got.unwrap().unwrap().frontmatter.links,
                Vec::<String>::new(),
                "{label}"
            );
        }
    }

    #[test]
    fn links_filter_non_string_elements_in_sequence() {
        let input = "---\nlinks: [\"tasks/a.md\", 1, \"tasks/b.md\", null]\n---\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.links,
            vec!["tasks/a.md".to_string(), "tasks/b.md".to_string()]
        );
    }

    #[test]
    fn links_is_empty_when_key_absent() {
        let input = "---\ntitle: A\nstatus: TODO\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.links, Vec::<String>::new());
    }

    #[test]
    fn links_is_excluded_from_extras_when_typed() {
        let input = "---\ntitle: A\nstatus: TODO\nlinks: tasks/a.md\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(parsed.frontmatter.links, vec!["tasks/a.md".to_string()]);
        assert!(!parsed.frontmatter.extras.contains_key("links"));
        assert_eq!(parsed.frontmatter.extras.len(), 2);
        assert!(parsed.frontmatter.extras.contains_key("title"));
        assert!(parsed.frontmatter.extras.contains_key("status"));
    }

    #[test]
    fn links_duplicate_key_returns_invalid_yaml() {
        let input = "---\nlinks: a\nlinks: b\n---\n";
        let got = parse(input);
        assert!(
            matches!(got, Err(FrontmatterError::InvalidYaml(_))),
            "重複 links キーは InvalidYaml: got {got:?}"
        );
    }

    // ─────────────────────────────────────────────────────────
    // 共存 / 補助 系：Cycle 33〜34
    // ─────────────────────────────────────────────────────────
    #[test]
    fn labels_and_links_coexist_independently() {
        let input = "---\nlabels: [a, a, b]\nlinks: [x, y, x]\n---\nbody\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.labels,
            vec!["a".to_string(), "b".to_string()]
        );
        assert_eq!(
            parsed.frontmatter.links,
            vec!["x".to_string(), "y".to_string()]
        );
    }

    #[test]
    fn labels_and_links_work_with_bom_and_crlf() {
        let input = "\u{FEFF}---\r\nlabels: [bug, fix]\r\nlinks: tasks/a.md\r\n---\r\nbody\r\n";
        let parsed = parse(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.labels,
            vec!["bug".to_string(), "fix".to_string()]
        );
        assert_eq!(parsed.frontmatter.links, vec!["tasks/a.md".to_string()]);
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
