use serde::{Deserialize, Deserializer, Serialize};
use std::borrow::Cow;
use std::collections::HashSet;
use thiserror::Error;

// YAML Mapping から除外し、codec が固定順で扱う typed frontmatter keys。
pub(crate) const TYPED_KEYS: [&str; 8] = [
    "title",
    "status",
    "priority",
    "labels",
    "milestone",
    "parent",
    "links",
    "draft",
];

/// タスクの優先度。YAML フロントマターの `priority` 値を
/// ASCII 大小文字非区別で正規化したもの。
///
/// 未定義文字列（例: `urgent`）や型不一致（数値・配列・mapping・null・bool）は
/// `Frontmatter::priority` 上で `None` として表現される（バッジ非表示扱い）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
/// `priority` は `Priority` enum に正規化された typed フィールド。
/// 値が未定義文字列・型不一致・null・キー不在の場合はすべて `None`（バッジ非表示）。
///
/// `labels` / `links` は共通 lenient deserializer により `Vec<String>` に正規化される typed
/// フィールド。単一文字列は 1 要素配列に変換され、配列は要素単位 lenient + 重複除去
/// （first-occurrence wins）される。型不一致やキー不在の場合は `vec![]`。空文字列要素は
/// 保持する（trim しない）。
///
/// `priority` / `labels` / `links` 以外の YAML キーは `extras` に
/// `serde_yaml_ng::Value` として保持される。
#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
pub struct Frontmatter {
    /// 優先度。値が無い・未定義文字列・型不一致のいずれも `None`。
    #[serde(default, deserialize_with = "deserialize_priority_lenient")]
    pub priority: Option<Priority>,
    /// ラベルの配列。単一文字列は 1 要素配列に変換 + 重複除去（first-occurrence wins）。
    /// 型不一致や要素単位の非文字列はすべて除外し、エラー化しない。
    #[serde(default, deserialize_with = "deserialize_string_vec_lenient")]
    pub labels: Vec<String>,
    /// マイルストーン参照キー（単数の自由文字列）。priority と同じく typed フィールドで、
    /// 文字列以外・null・空文字は `None`（未割当）に倒す lenient 解釈。
    #[serde(default, deserialize_with = "deserialize_milestone_lenient")]
    pub milestone: Option<String>,
    /// 関連タスクのファイルパス配列。labels と同じ正規化ロジックを共有する。
    #[serde(default, deserialize_with = "deserialize_string_vec_lenient")]
    pub links: Vec<String>,
    /// 下書きフラグ。`Value::Bool(true)` のみ `Some(true)`。
    /// `false` / 文字列 / 数値 / null 等はすべて `None`（非 draft）に倒す lenient 解釈。
    #[serde(default, deserialize_with = "deserialize_draft_lenient")]
    pub draft: Option<bool>,
    #[serde(flatten)]
    pub extras: serde_yaml_ng::Mapping,
}

/// `priority` フィールド用の lenient deserializer。
///
/// `serde_yaml_ng::Value::deserialize` で一度 `Value` を受け取り、
/// `Value::String(s)` のみを `Priority::from_ascii_ci` で正規化する。
/// 数値・配列・mapping・null・bool など型不一致はすべて `Ok(None)` に落とす。
///
/// `priority` 値の型不一致や未定義文字列で `FrontmatterError::InvalidYaml` 化することはない。
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

/// `milestone` フィールド用の lenient deserializer（priority の単数版）。
///
/// `serde_yaml_ng::Value::deserialize` で一度 `Value` を受け取り、`Value::String` かつ
/// 非空のときのみ `Some(s)`。文字列以外（数値 / 配列 / mapping / null / bool）と空文字は
/// `None`（未割当）に倒す。milestone 値の型不一致でパースエラーにはしない。
fn deserialize_milestone_lenient<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_yaml_ng::Value::deserialize(deserializer)?;
    let serde_yaml_ng::Value::String(s) = value else {
        return Ok(None);
    };
    if s.is_empty() {
        return Ok(None);
    }
    Ok(Some(s))
}

/// `draft` フィールド用の lenient deserializer（milestone の bool 版）。
///
/// `serde_yaml_ng::Value::deserialize` で一度 `Value` を受け取り、`Value::Bool(true)` のみ
/// `Some(true)`。`false`・文字列・数値・null 等はすべて `None`（非 draft）に倒す。
/// draft 値の型不一致でパースエラーにはしない（warning も付与しない）。
fn deserialize_draft_lenient<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = serde_yaml_ng::Value::deserialize(deserializer)?;
    if value == serde_yaml_ng::Value::Bool(true) {
        return Ok(Some(true));
    }
    Ok(None)
}

/// `labels` / `links` フィールド用の共通 lenient deserializer。
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
    /// YAML 構文エラー、または YAML ルートが mapping でない場合。
    #[error("invalid YAML in frontmatter: {0}")]
    InvalidYaml(#[source] serde_yaml_ng::Error),

    /// 入力バイト列が UTF-8 として解釈できない場合（= `std::str::from_utf8` が失敗する場合）に返す。
    /// UTF-8 BOM (EF BB BF) 除去後のバイト列が UTF-8 として valid でないとき発生する。
    /// UTF-16 LE/BE / UTF-32 / Shift-JIS / その他のバイナリ入力は、それらが UTF-8 として
    /// invalid である限りこの variant に集約される（たまたま valid UTF-8 として解釈できる
    /// バイト列の場合は別経路でパースされる）。
    #[error("invalid encoding in frontmatter: {0}")]
    InvalidEncoding(#[from] std::str::Utf8Error),

    #[error("frontmatter was not found")]
    NotTask,

    #[error("failed to serialize frontmatter: {source}")]
    Serialize {
        #[source]
        source: serde_yaml_ng::Error,
    },

    #[error("failed to serialize frontmatter: {0}")]
    SerializeMessage(String),
}

impl From<serde_yaml_ng::Error> for FrontmatterError {
    fn from(source: serde_yaml_ng::Error) -> Self {
        Self::InvalidYaml(source)
    }
}

/// バイト列入力を受け取り、UTF-8 BOM (EF BB BF) を 1 個剥がしてから UTF-8 として検証し、
/// 既存の文字列パース [`parse`] に委譲する。
///
/// # 検証規則
/// - 先頭 3 バイトが `EF BB BF` であれば 1 個だけ除去する。BOM が無い場合は何もしない。
/// - BOM 除去後のバイト列が UTF-8 として valid でない場合は
///   [`FrontmatterError::InvalidEncoding`] を返す。
///   UTF-8 として解釈できない入力（UTF-16 / UTF-32 / Shift-JIS / その他バイナリの多く）は
///   この経路で弾かれる（たまたま valid UTF-8 として解釈できるバイト列はこの経路では弾かれない）。
/// - UTF-8 検証に成功した場合は [`parse`] に委譲し、その結果をそのまま返す。
///
/// # BOM 繰り返し入力
/// 先頭に BOM が 2 個以上連続する場合、バイト段階で 1 個、続く文字列段階の正規化で
/// 更に 1 個（U+FEFF として）剥がれるため、結果として最大 2 個まで暗黙に剥がれる仕様とする。
/// 3 個以上連続する場合は剥がしきれない U+FEFF が先頭に残り、先頭行が `---` で始まらない
/// ため frontmatter として認識されず `Ok(None)` を返す。
///
/// # アロケーション
/// BOM 剥離と UTF-8 検証自体は zero-copy で追加アロケーションを行わない
/// （`<[u8]>::strip_prefix` と `std::str::from_utf8` はいずれもバイト・文字列
/// スライス参照を返すため）。委譲先の [`parse`] 内ではフロントマター分割や
/// CRLF 正規化が必要な入力に対して `String` のアロケーションが発生し得る。
pub fn parse_bytes(input: &[u8]) -> Result<Option<Parsed>, FrontmatterError> {
    let stripped = input.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(input);
    let s = std::str::from_utf8(stripped)?;
    parse(s)
}

/// 入力文字列から frontmatter を抽出してパースする。
///
/// # 区切り検出
/// frontmatter は **「先頭行が `---`（末尾空白許容）から、続く最初の単独行 `---` まで」**
/// と定義する。先頭 `---` 以降に現れる最初の単独行 `---` は常に closing delimiter とみなす
/// （本文中に偶発的に `---` が含まれる場合も区切りとして解釈される）。
/// YAML document end marker `...` は区切りとして扱わない。
///
/// # 戻り値
/// - フロントマターが存在しない場合: `Ok(None)`
///   - 先頭行が `---` でない / 2 つ目の単独行 `---` が見つからない 場合を含む
/// - YAML パース失敗時: `Err(FrontmatterError::InvalidYaml)`
///   - YAML 構文エラー / ルートが mapping でない (sequence / scalar / null) を含む
/// - 成功時: typed `priority` / `labels` / `links` を含む `Ok(Some(Parsed))`
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
        .transpose()
        .map_err(FrontmatterError::InvalidYaml)?
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

/// `Parsed` を md ファイル相当の文字列に書き戻す。
///
/// # フィールド順序
/// `title → status → priority → labels → milestone → parent → links → draft → その他 (extras 出現順)`。
/// typed キー以外の extras は parse 時の出現順を保ったまま末尾に並ぶ
/// （`Frontmatter::extras` が `serde_yaml_ng::Mapping` で挿入順を保持するため）。
///
/// # 空値の省略
/// `priority` が `None` のときは `priority:` 行を出力しない。
/// `labels` / `links` が空配列のときは対応する行を出力しない。
/// title / status / parent は `extras` に存在しなければ対応する行を出力しない。
///
/// # 入力前提
/// 本関数は [`parse`] / [`parse_bytes`] 由来の `Parsed` を入力前提とする
/// （CRLF はすでに LF に正規化済み）。`Parsed` を手動構築するユースケースは
/// 想定外で、その場合の出力は本仕様の保証外。
///
/// # 本文と改行
/// `parse` / `parse_bytes` 由来の `Parsed` であれば body は LF のみで構成される。
/// 本関数は body の追加正規化を行わずそのまま付加する（本文保持のため）。
/// 入力前提が満たされる限り、出力全体は LF (`\n`) で構成され、
/// ファイル末尾には必ず `\n` を付与する。
///
/// # 空フロントマター
/// 入力が `parse("---\n---\nbody\n")` 由来で `Frontmatter` がデフォルトかつ
/// extras も空の場合、出力は `"---\n---\nbody\n"` を保ち、フロントマターの区切りは必ず出力する。
///
/// # 失敗時の挙動
/// `serde_yaml_ng::to_string` の失敗は `FrontmatterError::Serialize` として返す。
/// 呼び出し側は panic に依存せず、typed error として利用者へ伝播できる。
pub fn serialize(parsed: &Parsed) -> Result<String, FrontmatterError> {
    let mapping = build_mapping(&parsed.frontmatter);
    let yaml_body = if mapping.is_empty() {
        String::new()
    } else {
        serde_yaml_ng::to_string(&mapping)
            .map_err(|source| FrontmatterError::Serialize { source })?
    };

    let mut out = String::with_capacity(yaml_body.len() + parsed.body.len() + 8);
    out.push_str("---\n");
    out.push_str(&yaml_body);
    out.push_str("---\n");
    out.push_str(&parsed.body);
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

/// 固定順 typed キー → 残り extras (出現順) の `Mapping` を組み立てる。
///
/// title / status / parent は `extras` 内に保持された値を typed 位置で取り出す。
/// priority は `Option<Priority>` から先頭大文字（High / Medium / Low）で出力する。
/// labels / links は空配列の場合は対応するキーを出力しない。
/// draft は `Some(true)` のときのみ `draft: true` を出力する（false は書かない）。
fn build_mapping(fm: &Frontmatter) -> serde_yaml_ng::Mapping {
    use serde_yaml_ng::{Mapping, Value};

    let mut map = Mapping::new();

    if let Some(v) = fm.extras.get("title") {
        map.insert(Value::String("title".into()), v.clone());
    }
    if let Some(v) = fm.extras.get("status") {
        map.insert(Value::String("status".into()), v.clone());
    }

    if let Some(p) = fm.priority {
        let s = match p {
            Priority::High => "High",
            Priority::Medium => "Medium",
            Priority::Low => "Low",
        };
        map.insert(Value::String("priority".into()), Value::String(s.into()));
    }

    if !fm.labels.is_empty() {
        map.insert(
            Value::String("labels".into()),
            string_vec_to_value_sequence(&fm.labels),
        );
    }

    if let Some(ref m) = fm.milestone {
        map.insert(Value::String("milestone".into()), Value::String(m.clone()));
    }

    if let Some(v) = fm.extras.get("parent") {
        map.insert(Value::String("parent".into()), v.clone());
    }

    if !fm.links.is_empty() {
        map.insert(
            Value::String("links".into()),
            string_vec_to_value_sequence(&fm.links),
        );
    }

    if fm.draft == Some(true) {
        map.insert(Value::String("draft".into()), Value::Bool(true));
    }

    for (k, v) in &fm.extras {
        let is_typed = k.as_str().map(|s| TYPED_KEYS.contains(&s)).unwrap_or(false);
        if is_typed {
            continue;
        }
        map.insert(k.clone(), v.clone());
    }

    map
}

/// `Vec<String>` を `Value::Sequence(Vec<Value::String>)` に変換する小ヘルパー。
fn string_vec_to_value_sequence(items: &[String]) -> serde_yaml_ng::Value {
    let seq: Vec<serde_yaml_ng::Value> = items
        .iter()
        .map(|s| serde_yaml_ng::Value::String(s.clone()))
        .collect();
    serde_yaml_ng::Value::Sequence(seq)
}

#[cfg(test)]
#[path = "frontmatter_tests.rs"]
mod frontmatter_tests;
