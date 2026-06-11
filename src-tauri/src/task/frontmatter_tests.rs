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

// ─────────────────────────────────────────────────────────
// parse_bytes 系（BOM / UTF-8 検証）：Cycle 38〜45
// ─────────────────────────────────────────────────────────

/// Cycle 38: BOM あり / BOM なし いずれの UTF-8 入力も正常パースされること。
/// BOM 付き入力は 1 個剥がされ、内部の `parse(&str)` と同じ結果を返す。
#[test]
fn parse_bytes_strips_utf8_bom_and_parses() {
    let with_bom: Vec<u8> = [b"\xEF\xBB\xBF" as &[u8], b"---\ntitle: A\n---\nbody\n"].concat();
    let without_bom: &[u8] = b"---\ntitle: A\n---\nbody\n";

    let cases: Vec<(&[u8], &str)> = vec![(&with_bom, "BOM あり"), (without_bom, "BOM なし")];

    for (input, label) in cases {
        let parsed = parse_bytes(input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.extras.get("title"),
            Some(&serde_yaml_ng::Value::String("A".into())),
            "{label}: title"
        );
        assert_eq!(parsed.body, "body\n", "{label}: body");
    }
}

/// Cycle 39: Shift-JIS 日本語入力（UTF-8 として invalid）は
/// `Err(FrontmatterError::InvalidEncoding(_))` を返すこと。
/// 入力中の `\x83^\x83C\x83g\x83\x8B` は「タイトル」を Shift-JIS で表現したバイト列。
#[test]
fn parse_bytes_rejects_shift_jis() {
    let input: &[u8] = b"---\ntitle: \x83^\x83C\x83g\x83\x8B\n---\n";
    let got = parse_bytes(input);
    assert!(
        matches!(got, Err(FrontmatterError::InvalidEncoding(_))),
        "expected Err(InvalidEncoding), got {got:?}"
    );
}

/// Cycle 40 (characterization): UTF-16 LE BOM (FF FE) / UTF-16 BE BOM (FE FF) で
/// 始まる入力は `Err(InvalidEncoding)` を返すこと。
#[test]
fn parse_bytes_rejects_utf16_bom() {
    let cases: Vec<(&[u8], &str)> = vec![
        (b"\xFF\xFE\x2D\x00\x2D\x00\x2D\x00", "UTF-16 LE BOM + ---"),
        (b"\xFE\xFF\x00\x2D\x00\x2D\x00\x2D", "UTF-16 BE BOM + ---"),
    ];

    for (input, label) in cases {
        let got = parse_bytes(input);
        assert!(
            matches!(got, Err(FrontmatterError::InvalidEncoding(_))),
            "{label}: expected Err(InvalidEncoding), got {got:?}"
        );
    }
}

/// Cycle 41 (characterization): 空バイト列 / BOM のみ / 部分 BOM の境界挙動。
#[test]
fn parse_bytes_handles_short_inputs() {
    // 空入力: frontmatter なし扱い
    let got_empty = parse_bytes(b"");
    assert!(
        matches!(got_empty, Ok(None)),
        "空入力: expected Ok(None), got {got_empty:?}"
    );

    // BOM のみ: 剥離後は空文字列
    let got_bom_only = parse_bytes(b"\xEF\xBB\xBF");
    assert!(
        matches!(got_bom_only, Ok(None)),
        "BOM のみ: expected Ok(None), got {got_bom_only:?}"
    );

    // 部分 BOM: from_utf8 が不完全シーケンスで失敗
    let got_partial = parse_bytes(b"\xEF\xBB");
    assert!(
        matches!(got_partial, Err(FrontmatterError::InvalidEncoding(_))),
        "部分 BOM: expected Err(InvalidEncoding), got {got_partial:?}"
    );
}

/// Cycle 42 (characterization): BOM が 2 個連続する入力でも正常パースできること。
/// バイト段階で 1 個 + 文字列段階の `normalize` で U+FEFF 1 個 = 合計 2 個剥がれる仕様を固定する。
#[test]
fn parse_bytes_with_repeated_bom_is_parsed() {
    let input: Vec<u8> = [
        b"\xEF\xBB\xBF" as &[u8],
        b"\xEF\xBB\xBF---\ntitle: A\n---\nbody\n",
    ]
    .concat();

    let got = parse_bytes(&input);
    assert!(
        matches!(got, Ok(Some(_))),
        "expected Ok(Some(_)), got {got:?}"
    );
    let parsed = got.unwrap().unwrap();
    assert_eq!(
        parsed.frontmatter.extras.get("title"),
        Some(&serde_yaml_ng::Value::String("A".into()))
    );
    assert_eq!(parsed.body, "body\n");
}

/// Cycle 43 (characterization): 純 ASCII / BOM なし UTF-8 マルチバイト入力が正常パースされること。
#[test]
fn parse_bytes_accepts_utf8_without_bom() {
    let multibyte = "---\ntitle: \u{3042}\n---\nbody\n";
    let cases: Vec<(&[u8], &str)> = vec![
        (b"---\ntitle: hello\n---\nbody\n", "純 ASCII"),
        (
            multibyte.as_bytes(),
            "BOM なし UTF-8 マルチバイト ひらがな あ",
        ),
    ];

    for (input, label) in cases {
        let got = parse_bytes(input);
        assert!(
            matches!(got, Ok(Some(_))),
            "{label}: expected Ok(Some(_)), got {got:?}"
        );
    }
}

/// Cycle 44 (characterization): BOM なし or 単一 BOM までの valid UTF-8 入力で
/// `parse_bytes(s.as_bytes())` の結果が `parse(s)` の結果と一致すること。
/// `FrontmatterError` は `PartialEq` 未導出のため `unwrap()` 後の `Option<Parsed>` を比較する。
#[test]
fn parse_bytes_is_equivalent_to_parse_for_valid_utf8() {
    let s = "---\nlabels: [bug, fix]\npriority: high\n---\nbody\n";
    assert_eq!(parse_bytes(s.as_bytes()).unwrap(), parse(s).unwrap());
}

/// Cycle 45 (characterization): BOM 付きバイト列入力 `parse_bytes(b"\xEF\xBB\xBF...")` と
/// U+FEFF 付き文字列入力 `parse("\u{FEFF}...")` の結果が一致すること（境界の冪等性）。
#[test]
fn parse_bytes_with_bom_yields_same_result_as_parse_with_bom_str() {
    let bytes_with_bom: &[u8] = b"\xEF\xBB\xBF---\ntitle: A\n---\nbody\n";
    let str_with_bom = "\u{FEFF}---\ntitle: A\n---\nbody\n";

    assert_eq!(
        parse_bytes(bytes_with_bom).unwrap(),
        parse(str_with_bom).unwrap()
    );
}

// ─────────────────────────────────────────────────────────
// serialize 系（フィールド順序 / 空値省略 / ラウンドトリップ）：Cycle 47〜55
//   ※ Cycle 46 は extras を `serde_yaml_ng::Mapping` へ置換するための独立リファクタリング
//     Cycle で、serialize 関数自体はまだ存在しないため新規テストは追加しない。
// ─────────────────────────────────────────────────────────

/// 出力中に複数キーが期待順序で現れることを assert するヘルパー。
/// 各キーは `\n{key}:` の形で行頭に出現することを前提とする。
fn assert_keys_in_order(output: &str, keys: &[&str]) {
    let mut prev_pos: Option<usize> = None;
    let mut prev_key: Option<&str> = None;
    for k in keys {
        let needle = format!("\n{k}:");
        let pos = output.find(&needle).unwrap_or_else(|| {
            panic!("key `{k}` not found in output:\n{output}");
        });
        if let (Some(p), Some(pk)) = (prev_pos, prev_key) {
            assert!(
                p < pos,
                "key `{pk}` should appear before `{k}`: prev={p}, curr={pos}\n{output}"
            );
        }
        prev_pos = Some(pos);
        prev_key = Some(k);
    }
}

/// Cycle 47: title + status のみの最小入力でラウンドトリップが成立する。
#[test]
fn serialize_minimum_title_status_round_trips() {
    let original = "---\ntitle: A\nstatus: TODO\n---\nbody\n";
    let parsed = parse(original).unwrap().unwrap();
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(parsed, reparsed);
}

/// Cycle 48: priority Some の場合は先頭大文字（High / Medium / Low）で出力される。
#[test]
fn serialize_emits_priority_with_leading_capital_when_some() {
    let cases: Vec<(&str, &str, &str)> = vec![
        (
            "---\ntitle: A\npriority: HIGH\n---\nbody\n",
            "priority: High",
            "HIGH",
        ),
        (
            "---\ntitle: A\npriority: Medium\n---\nbody\n",
            "priority: Medium",
            "Medium",
        ),
        (
            "---\ntitle: A\npriority: low\n---\nbody\n",
            "priority: Low",
            "low",
        ),
    ];

    for (input, expected_substr, label) in cases {
        let parsed = parse(input).unwrap().unwrap();
        let output = serialize(&parsed);
        assert!(
            output.contains(expected_substr),
            "{label}: expected to contain `{expected_substr}`:\n{output}"
        );
    }
}

/// Cycle 48: priority キーが存在しない場合は priority 行を出力しない。
#[test]
fn serialize_omits_priority_line_when_none() {
    let input = "---\ntitle: A\nstatus: TODO\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert!(
        !output.contains("priority:"),
        "expected no `priority:` line:\n{output}"
    );
}

/// Cycle 48: parse 時点で `None` 化された不正値（例: `urgent`）は再 serialize で消失する。
/// 元 YAML の不正値は復元されない仕様。
#[test]
fn serialize_drops_invalid_priority_value_due_to_parse_normalization() {
    let input = "---\ntitle: A\nstatus: TODO\npriority: urgent\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    assert_eq!(parsed.frontmatter.priority, None);
    let output = serialize(&parsed);
    assert!(
        !output.contains("priority:"),
        "expected no `priority:` line for invalid value:\n{output}"
    );
}

/// Cycle 49: labels 非空配列は `Value::Sequence` として出力される。
#[test]
fn serialize_emits_labels_as_sequence_when_non_empty() {
    let input = "---\ntitle: A\nlabels: [bug, fix]\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert!(
        output.contains("labels:"),
        "should contain labels key:\n{output}"
    );
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(
        reparsed.frontmatter.labels,
        vec!["bug".to_string(), "fix".to_string()]
    );
}

/// Cycle 49: labels 空配列の場合は `labels:` 行を出力しない。
#[test]
fn serialize_omits_labels_line_when_empty() {
    let cases: Vec<(&str, &str)> = vec![
        ("---\ntitle: A\nlabels: []\n---\nbody\n", "明示空配列"),
        ("---\ntitle: A\n---\nbody\n", "labels キー不在"),
    ];

    for (input, label) in cases {
        let parsed = parse(input).unwrap().unwrap();
        let output = serialize(&parsed);
        assert!(
            !output.contains("labels:"),
            "{label}: expected no `labels:` line:\n{output}"
        );
    }
}

/// Cycle 50: parent は labels と links の間（typed 位置）に出力される。
#[test]
fn serialize_places_parent_between_labels_and_links() {
    let input = "---\ntitle: A\nstatus: TODO\nlabels: [bug]\nparent: tasks/p.md\nlinks: [a.md]\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert_keys_in_order(&output, &["title", "status", "labels", "parent", "links"]);
}

/// Cycle 51: links 非空配列は `Value::Sequence` として出力される。
#[test]
fn serialize_emits_links_as_sequence_when_non_empty() {
    let input = "---\ntitle: A\nlinks: [a.md, b.md]\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert!(
        output.contains("links:"),
        "should contain links key:\n{output}"
    );
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(
        reparsed.frontmatter.links,
        vec!["a.md".to_string(), "b.md".to_string()]
    );
}

/// Cycle 51: links 空配列の場合は `links:` 行を出力しない。
#[test]
fn serialize_omits_links_line_when_empty() {
    let cases: Vec<(&str, &str)> = vec![
        ("---\ntitle: A\nlinks: []\n---\nbody\n", "明示空配列"),
        ("---\ntitle: A\n---\nbody\n", "links キー不在"),
    ];

    for (input, label) in cases {
        let parsed = parse(input).unwrap().unwrap();
        let output = serialize(&parsed);
        assert!(
            !output.contains("links:"),
            "{label}: expected no `links:` line:\n{output}"
        );
    }
}

/// Cycle 52: 既知 6 キー以外の extras は parse 時の出現順を保ったまま末尾に並ぶ。
#[test]
fn serialize_preserves_extras_insertion_order() {
    let input = "---\nfoo: 1\nbar: 2\nbaz: 3\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert_keys_in_order(&output, &["foo", "bar", "baz"]);
}

/// Cycle 53: 本文部分は `Parsed::body` と一致して付加される（変換しない）。
#[test]
fn serialize_preserves_body_byte_for_byte() {
    let input = "---\ntitle: A\n---\n## 概要\n\n本文\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let body_in_output = output
        .split_once("---\n")
        .and_then(|(_, rest)| rest.split_once("---\n"))
        .map(|(_, body)| body)
        .unwrap();
    assert_eq!(body_in_output, parsed.body);
}

/// Cycle 53: body の末尾改行有無に関わらず、出力末尾には必ず `\n` が付与される。
#[test]
fn serialize_ensures_trailing_newline() {
    let cases: Vec<(&str, &str)> = vec![
        ("---\ntitle: A\n---\n", "body 空"),
        ("---\ntitle: A\n---\nbody", "末尾改行なし"),
        ("---\ntitle: A\n---\nbody\n", "末尾改行あり"),
    ];

    for (input, label) in cases {
        let parsed = parse(input).unwrap().unwrap();
        let output = serialize(&parsed);
        assert!(
            output.ends_with('\n'),
            "{label}: expected output to end with newline:\n{output}"
        );
    }
}

/// Cycle 53: parse 経由の `Parsed` を serialize した結果には CR が含まれない。
#[test]
fn serialize_uses_lf_line_endings_only_for_parse_origin_input() {
    let input = "---\r\ntitle: A\r\nstatus: TODO\r\n---\r\nbody\r\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert!(
        !output.contains('\r'),
        "expected output without CR:\n{output:?}"
    );
}

/// Cycle 53: 空フロントマター入力でも区切り行を残し、再 parse で同値となる。
#[test]
fn serialize_keeps_empty_frontmatter_fences_with_body() {
    let input = "---\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert_eq!(output, "---\n---\nbody\n");
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(parsed, reparsed);
}

/// Cycle 54: 全 typed フィールド + 未知フィールドのフルケースで
/// `parse(serialize(p1)) == p1` かつ出力フィールド順が固定順序（title → status →
/// priority → labels → parent → links → その他）を満たす。
#[test]
fn serialize_full_case_round_trips_through_parse() {
    let input = concat!(
        "---\n",
        "title: T\n",
        "status: S\n",
        "priority: high\n",
        "labels: [bug, fix]\n",
        "parent: tasks/p.md\n",
        "links: [a.md, b.md]\n",
        "foo: F\n",
        "bar: B\n",
        "---\n",
        "body text\n",
    );
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert_keys_in_order(
        &output,
        &[
            "title", "status", "priority", "labels", "parent", "links", "foo", "bar",
        ],
    );
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(parsed, reparsed);
}

/// Cycle 54: body 末尾改行なし入力では再 parse 時に `\n` 1 byte 増えるが、
/// fixed-point 性 `serialize(parse(serialize(p1))) == serialize(p1)` は成立する。
#[test]
fn serialize_round_trips_for_body_without_trailing_newline_via_fixed_point() {
    let input = "---\n---\nbody";
    let p1 = parse(input).unwrap().unwrap();
    assert_eq!(p1.body, "body");
    let s1 = serialize(&p1);
    let p2 = parse(&s1).unwrap().unwrap();
    assert_eq!(p2.body, format!("{}\n", p1.body));
    assert_eq!(serialize(&p2), s1);
}

/// Cycle 54: 空 body 入力でラウンドトリップが成立する（`Parsed` 直比較）。
#[test]
fn serialize_round_trips_for_empty_body() {
    let input = "---\ntitle: A\n---\n";
    let parsed = parse(input).unwrap().unwrap();
    assert_eq!(parsed.body, "");
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(parsed, reparsed);
}

/// Cycle 54: 空フロントマター + 空 body の最小区切り入力でラウンドトリップが成立する。
#[test]
fn serialize_round_trips_for_empty_frontmatter_and_empty_body() {
    let cases: Vec<(&str, &str)> =
        vec![("---\n---\n", "末尾改行あり"), ("---\n---", "末尾改行なし")];

    for (input, label) in cases {
        let parsed = parse(input).unwrap().unwrap();
        let output = serialize(&parsed);
        let reparsed = parse(&output).unwrap().unwrap();
        assert_eq!(parsed, reparsed, "{label}");
    }
}

/// Cycle 54: CRLF 入力（parse 経由で LF 正規化済み）でラウンドトリップが成立する。
#[test]
fn serialize_round_trips_for_crlf_input_via_parse() {
    let input = "---\r\ntitle: A\r\nstatus: TODO\r\n---\r\nbody\r\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(parsed, reparsed);
}

/// Cycle 54: BOM 付きバイト列入力（parse_bytes 経由）でラウンドトリップが成立する。
#[test]
fn serialize_round_trips_for_bom_prefixed_input_via_parse_bytes() {
    let input: &[u8] = b"\xEF\xBB\xBF---\ntitle: A\nstatus: TODO\n---\nbody\n";
    let parsed = parse_bytes(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(parsed, reparsed);
}

/// Cycle 55: extras 内の title / status / parent が型不一致でも typed 位置に dump される。
/// 各ケースで fixed-point 性を確認する。
#[test]
fn serialize_dumps_extras_title_status_parent_at_typed_position_for_non_string() {
    let cases: Vec<(&str, &[&str], &str)> = vec![
        (
            "---\ntitle: 42\nstatus: TODO\n---\nbody\n",
            &["title", "status"],
            "title が数値",
        ),
        (
            "---\ntitle: A\nstatus:\n  - a\n  - b\n---\nbody\n",
            &["title", "status"],
            "status が配列",
        ),
        (
            "---\ntitle: A\nlabels: [bug]\nparent:\n  level: 1\nlinks: [a.md]\n---\nbody\n",
            &["title", "labels", "parent", "links"],
            "parent が mapping",
        ),
    ];

    for (input, expected_order, label) in cases {
        let parsed = parse(input).unwrap().unwrap();
        let output = serialize(&parsed);
        assert_keys_in_order(&output, expected_order);
        let reparsed = parse(&output).unwrap().unwrap();
        assert_eq!(
            serialize(&reparsed),
            output,
            "{label}: fixed-point should hold"
        );
    }
}

// ───────── milestone（typed・単数・lenient） ─────────

/// `milestone: v0.3` は `Some("v0.3")` にパースされる。
#[test]
fn parse_milestone_string_is_some() {
    let parsed = parse("---\ntitle: A\nmilestone: v0.3\n---\nbody\n")
        .unwrap()
        .unwrap();
    assert_eq!(parsed.frontmatter.milestone.as_deref(), Some("v0.3"));
}

/// 文字列以外・null・空文字は `None`（lenient・parse エラーにしない）。
#[test]
fn parse_milestone_non_string_or_empty_is_none() {
    let cases = [
        "---\ntitle: A\nmilestone: [v0.3]\n---\nbody\n",
        "---\ntitle: A\nmilestone: 123\n---\nbody\n",
        "---\ntitle: A\nmilestone: null\n---\nbody\n",
        "---\ntitle: A\nmilestone: \"\"\n---\nbody\n",
    ];
    for input in cases {
        let parsed = parse(input).unwrap().unwrap();
        assert!(
            parsed.frontmatter.milestone.is_none(),
            "milestone should be None for: {input:?}"
        );
    }
}

/// milestone は labels の後・parent の前（SL-002 順序）で出力される。
#[test]
fn serialize_places_milestone_between_labels_and_parent() {
    let input = "---\ntitle: A\nstatus: TODO\npriority: High\nlabels: [bug]\nmilestone: v0.3\nparent: tasks/p.md\nlinks: [a.md]\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    assert_keys_in_order(
        &output,
        &[
            "title",
            "status",
            "priority",
            "labels",
            "milestone",
            "parent",
            "links",
        ],
    );
}

/// milestone を持つ frontmatter で、milestone が extras に二重流入しない（TYPED_KEYS）。
#[test]
fn parse_milestone_does_not_leak_into_extras() {
    let parsed = parse("---\ntitle: A\nmilestone: v0.3\n---\nbody\n")
        .unwrap()
        .unwrap();
    assert!(!parsed
        .frontmatter
        .extras
        .contains_key(serde_yaml_ng::Value::String("milestone".into())));
}

/// milestone + 未知 extras 混在で round-trip が安定（2 周しても不変・extras 二重流入なし）。
#[test]
fn serialize_milestone_round_trip_is_stable() {
    let input =
        "---\ntitle: A\nstatus: TODO\nlabels: [bug]\nmilestone: v0.3\nassignee: alice\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(reparsed.frontmatter.milestone.as_deref(), Some("v0.3"));
    assert!(!reparsed
        .frontmatter
        .extras
        .contains_key(serde_yaml_ng::Value::String("milestone".into())));
    // fixed-point: もう 1 周しても同一。
    assert_eq!(serialize(&reparsed), output);
}

/// milestone 不在の frontmatter は milestone 行を出力しない（後方互換・skip_serializing）。
#[test]
fn serialize_omits_milestone_line_when_none() {
    let parsed = parse("---\ntitle: A\nstatus: TODO\n---\nbody\n")
        .unwrap()
        .unwrap();
    let output = serialize(&parsed);
    assert!(
        !output.contains("milestone:"),
        "expected no `milestone:` line:\n{output}"
    );
}

/// due は typed フィールドではなく extras に残るため、parse → serialize で
/// 値と記述順（links の後）が保持され、消えない。
#[test]
fn serialize_preserves_valid_due_as_extra() {
    let input = "---\ntitle: A\nlabels: [bug]\nlinks: [a.md]\ndue: 2026-06-30\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);

    assert_keys_in_order(&output, &["title", "labels", "links", "due"]);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(
        reparsed.frontmatter.extras.get("due"),
        Some(&serde_yaml_ng::Value::String("2026-06-30".into())),
        "due value should survive round-trip"
    );
}

/// 不正フォーマットの due も extras 値としてそのまま round-trip 保持される。
#[test]
fn serialize_preserves_invalid_due_as_extra() {
    let input = "---\ntitle: A\nlinks: [a.md]\ndue: 2026/6/30\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();

    assert_eq!(
        reparsed.frontmatter.extras.get("due"),
        Some(&serde_yaml_ng::Value::String("2026/6/30".into())),
        "invalid due value should also survive round-trip"
    );
}

/// `draft: true` のみ Some(true)。lenient 解釈で false / 非 bool / null はすべて None。
#[test]
fn parse_draft_true_yields_some_true() {
    let parsed = parse("---\ntitle: A\ndraft: true\n---\nbody\n")
        .unwrap()
        .unwrap();
    assert_eq!(parsed.frontmatter.draft, Some(true));
}

#[test]
fn parse_draft_non_true_values_yield_none() {
    let cases = [
        "draft: false",
        "draft: \"yes\"",
        "draft: 1",
        "draft: null",
        "draft: [true]",
    ];
    for line in cases {
        let input = format!("---\ntitle: A\n{line}\n---\nbody\n");
        let parsed = parse(&input).unwrap().unwrap();
        assert_eq!(
            parsed.frontmatter.draft, None,
            "{line} は None（非 draft）になるべき"
        );
    }
}

#[test]
fn parse_draft_absent_yields_none() {
    let parsed = parse("---\ntitle: A\n---\nbody\n").unwrap().unwrap();
    assert_eq!(parsed.frontmatter.draft, None);
}

/// draft が extras に二重流入しない（TYPED_KEYS 8 要素の効果）。
#[test]
fn parse_draft_does_not_leak_into_extras() {
    let parsed = parse("---\ntitle: A\ndraft: true\n---\nbody\n")
        .unwrap()
        .unwrap();
    assert!(!parsed
        .frontmatter
        .extras
        .contains_key(serde_yaml_ng::Value::String("draft".into())));
}

/// serialize は links の後に draft: true を出力する。
#[test]
fn serialize_emits_draft_after_links_when_some_true() {
    let input = "---\ntitle: A\nstatus: TODO\nlinks:\n  - tasks/b.md\ndraft: true\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let links_pos = output.find("links:").expect("links line");
    let draft_pos = output.find("draft: true").expect("draft line");
    assert!(
        links_pos < draft_pos,
        "draft は links の後に出力されるべき:\n{output}"
    );
}

/// draft round-trip が安定（2 周しても不変）。
#[test]
fn serialize_draft_round_trip_is_stable() {
    let input = "---\ntitle: A\nstatus: TODO\ndraft: true\nassignee: alice\n---\nbody\n";
    let parsed = parse(input).unwrap().unwrap();
    let output = serialize(&parsed);
    let reparsed = parse(&output).unwrap().unwrap();
    assert_eq!(reparsed.frontmatter.draft, Some(true));
    assert_eq!(serialize(&reparsed), output);
}

/// draft 不在・None の frontmatter は draft 行を出力しない。
#[test]
fn serialize_omits_draft_line_when_none() {
    let parsed = parse("---\ntitle: A\nstatus: TODO\n---\nbody\n")
        .unwrap()
        .unwrap();
    let output = serialize(&parsed);
    assert!(
        !output.contains("draft:"),
        "expected no `draft:` line:\n{output}"
    );
}

/// 非 bool の draft 値（lenient で None 化）は再 serialize で extras 経由の重複出力もなく消える。
#[test]
fn serialize_drops_non_bool_draft_without_duplicate_output() {
    let parsed = parse("---\ntitle: A\nstatus: TODO\ndraft: \"yes\"\n---\nbody\n")
        .unwrap()
        .unwrap();
    let output = serialize(&parsed);
    assert!(
        !output.contains("draft"),
        "非 bool draft は再 serialize で出力されないべき:\n{output}"
    );
}
