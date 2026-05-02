//! プロジェクト設定 `.spec-board/config.json` のスキーマに対応する型定義。
//!
//! # serde 規約
//! 型レベルで `#[serde(rename_all = "camelCase")]` を付与し、
//! Rust 側 snake_case フィールドを JSON 側 camelCase キーへ自動マッピングする。
//!
//! - `card_order` ↔ `cardOrder`
//! - `done_column` ↔ `doneColumn`
//!
//! # Default
//! [`Config::default`] は `version = 1`、`columns = [Todo, In Progress, Done]`
//! （`order` は 0/1/2）、`card_order = {}`、`done_column = Some("Done")` を返す。
//! 設定仕様書の「設定の初期化」「エラーハンドリング」節のベースラインとして使用される。
//! `done_column` 未設定の既存 config を読み込んだ場合の「最後のカラム採用」フォールバックは、
//! 本モジュールが提供する [`Config::resolved_done_column`] を呼び出し層が利用する設計
//! （保存値には書き戻さない）。
//!
//! # ファイル I/O の境界
//! 低レベル I/O（`.spec-board/` の作成、`config.json` の raw 読み込み）は
//! サブクレート `spec-board-fs::config_io` に集約する。本モジュールは
//! その raw 文字列を `serde_json::from_str::<Config>` でパースし、不在時の
//! `Default` フォールバックと `done_column` の解決ヘルパを提供する薄い層に留める。
//!
//! # スコープ外（別 Issue で実装）
//! - `config.json` の書き出し（atomic write / `.bak` 退避 / 並行書き込み制御）
//! - バリデーション（columns 重複・doneColumn 整合性 / 名前空間整合）
//! - version マイグレーション
//! - GUIDE.md 自動生成
//! - Tauri コマンド層
//!
//! 既存タスクの `(path, status)` 列から `Config` を組み立てる純粋関数
//! [`build_config_from_statuses`] は本モジュールに同居する。
//! md ファイルの走査・フロントマター抽出・`config.json` への書き出しは別レイヤの責務。

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use spec_board_fs::config_io::{self, ConfigIoError};
use thiserror::Error;

/// `cardOrder` の型エイリアス。キー = カラム名、値 = タスクファイルパスの並び順配列。
///
/// `.spec-board/config.json` は git にコミットされる前提のため、シリアライズ時に
/// キー順序が決定論的になる `BTreeMap`（キー昇順）を採用し、無意味な diff や
/// マージコンフリクトを抑止する。値配列 `Vec<String>` 内の順序がカード表示順。
pub type CardOrder = BTreeMap<String, Vec<String>>;

/// プロジェクト設定全体。
///
/// `version` / `columns` / `card_order` は仕様上「必須: はい」のため、
/// JSON 側で欠落していると `serde_json::from_str` はエラーを返す
/// （部分的な手書き / 切り詰められた config を黙ってデフォルト値で受理し、
/// 後続の保存でユーザー設定を上書きしてしまうのを防ぐ）。
///
/// [`Config::default`] は spec の初回オープン時 / 読み込み失敗時のフォールバックに
/// 使われる想定で、`Todo` / `In Progress` / `Done` の 3 カラムと `done_column = "Done"`
/// を含むベースラインを返す（`config-spec.md` 「設定の初期化」「エラーハンドリング」節）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// 設定ファイルのスキーマバージョン。
    pub version: u32,
    /// カラム定義の配列。順序は `Column::order` 昇順で表示する想定（ソートは呼び出し側）。
    pub columns: Vec<Column>,
    /// カラム名 → そのカラム内のタスクファイルパス配列。空 `{}` を許容。
    pub card_order: CardOrder,
    /// 「完了」として扱うカラム名。仕様上「必須: いいえ」のため省略可。
    /// 未設定時は `columns` の最後のカラムを呼び出し層で採用する。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done_column: Option<String>,
}

const DEFAULT_VERSION: u32 = 1;

/// カラム（ステータス）定義。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Column {
    /// カラム名。タスクのフロントマター `status` と対応する。
    pub name: String,
    /// カラムの表示順序（0 始まり昇順を想定。連番である必要はない）。
    pub order: u32,
}

/// spec L85 の初回オープン時デフォルト / spec L223 の読み込み失敗時フォールバックで
/// 用いるベースラインカラム名。
const DEFAULT_COLUMN_NAMES: [&str; 3] = ["Todo", "In Progress", "Done"];

impl Default for Config {
    fn default() -> Self {
        let columns = DEFAULT_COLUMN_NAMES
            .iter()
            .enumerate()
            .map(|(i, name)| Column {
                name: (*name).into(),
                order: i as u32,
            })
            .collect();
        let done_column = DEFAULT_COLUMN_NAMES.last().map(|s| (*s).to_string());
        Self {
            version: DEFAULT_VERSION,
            columns,
            card_order: BTreeMap::new(),
            done_column,
        }
    }
}

impl Config {
    /// `done_column` の解決結果を返す。
    ///
    /// - `done_column` が `Some(_)` ならその参照をそのまま返す
    ///   （`columns` に存在しない値であっても解決層では検証しない）
    /// - `done_column` が `None` の場合は `columns` のうち `order` 最大の
    ///   カラム名を返す（= 表示上の末尾）
    /// - `done_column` が `None` かつ `columns` が空なら `None` を返す
    ///
    /// 設定仕様書の「`doneColumn` 未設定時は末尾カラムを採用」ルールに対応する純粋関数。
    /// `columns[].order` が表示順の真値であり、JSON 配列順とは独立しているため、
    /// `Vec::last()` ではなく `Iterator::max_by_key(|c| c.order)` で
    /// 「表示上の末尾」を計算する。同一 `order` の場合は `Iterator::max_by_key`
    /// の安定性により最後に現れた要素が選ばれる（同一 `order` は仕様非推奨）。
    pub fn resolved_done_column(&self) -> Option<&str> {
        if let Some(name) = self.done_column.as_deref() {
            return Some(name);
        }
        self.columns
            .iter()
            .max_by_key(|c| c.order)
            .map(|c| c.name.as_str())
    }
}

/// 既存タスクの `(path, status)` 列から [`Config`] を組み立てる純粋関数。
///
/// プロジェクトを開いたとき `.spec-board/config.json` が存在せず、md タスクが
/// 既に存在するケースで「status 出現順にカラムを生成して保存する」フローの
/// 中核ロジック（保存・走査・パースは別レイヤの責務）。
///
/// # 入力規約
/// - `inputs`: `(file_path, status)` のスライス。
///   - `file_path`: 関数内で path 昇順に defensive sort される（OS 依存順の流入防止）。
///     ソートは [`PathBuf`] の `Ord` 実装（バイト列比較）に従い、project-root からの
///     相対パスでの比較が前提。
///   - `status`:
///     - `Some(s)`: `s` をそのままカラム名候補に採用する。空文字 / 空白のみ /
///       前後空白を含む値も**そのまま採用**し、`trim` / 大文字小文字統一などの
///       正規化は呼び出し層の責務。
///     - `None`: 先頭デフォルトカラム名（[`DEFAULT_COLUMN_NAMES`] の先頭要素 = `"Todo"`）に
///       フォールバックする。
///
/// # 戻り値
/// - `version` = 1
/// - `columns`: status を first-occurrence wins で uniq し、`order = 0..N` を採番した
///   [`Column`] 列。入力が空のときは `vec![]`。
/// - `card_order`: 空 `{}`（"未記載タスクはカラム末尾扱い" 規則に依拠した安全側のデフォルト）。
/// - `done_column`: `columns` の末尾カラム名（[`Column::name`] のクローン）。
///   `columns` が空なら `None`。
///
/// # 決定論性
/// 呼び出し側のソート漏れがあっても OS 依存の走査順は流入しない
/// （内部で defensive sort するため）。
///
/// # 例
/// ```ignore
/// use std::path::PathBuf;
///
/// let inputs = vec![
///     (PathBuf::from("a.md"), Some("Todo".to_string())),
///     (PathBuf::from("b.md"), Some("Doing".to_string())),
///     (PathBuf::from("c.md"), Some("Todo".to_string())),
/// ];
/// let cfg = build_config_from_statuses(&inputs);
/// assert_eq!(cfg.columns.len(), 2);
/// ```
pub fn build_config_from_statuses(inputs: &[(PathBuf, Option<String>)]) -> Config {
    if inputs.is_empty() {
        return Config {
            version: DEFAULT_VERSION,
            columns: Vec::new(),
            card_order: BTreeMap::new(),
            done_column: None,
        };
    }

    let mut sorted: Vec<(PathBuf, Option<String>)> = inputs.to_vec();
    sorted.sort_by(|(a, _), (b, _)| a.cmp(b));

    let mut seen: HashSet<String> = HashSet::with_capacity(sorted.len());
    let mut names: Vec<String> = Vec::with_capacity(sorted.len());
    for (_, status) in &sorted {
        let name = match status {
            Some(s) => s.clone(),
            None => DEFAULT_COLUMN_NAMES[0].to_string(),
        };
        if seen.insert(name.clone()) {
            names.push(name);
        }
    }

    let columns: Vec<Column> = names
        .into_iter()
        .enumerate()
        .map(|(i, name)| Column {
            name,
            order: i as u32,
        })
        .collect();
    let done_column = columns.last().map(|c| c.name.clone());

    Config {
        version: DEFAULT_VERSION,
        columns,
        card_order: BTreeMap::new(),
        done_column,
    }
}

/// [`load_or_default`] で発生し得るエラー。
///
/// [`ConfigIoError`] は `#[from]` で透過的に伝播し、JSON パース失敗は
/// 本層で [`LoadConfigError::Parse`] に包んで返す
/// （境界規約: パースは本体クレートの責務）。
#[derive(Debug, Error)]
pub enum LoadConfigError {
    #[error(transparent)]
    Io(#[from] ConfigIoError),

    #[error("failed to parse config.json at `{path}`: {source}", path = path.display())]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

/// `<project_root>/.spec-board/config.json` を読み込み、[`Config`] を返す。
///
/// 1. `.spec-board/` ディレクトリを冪等に作成する
/// 2. `config.json` の存在を確認し、不在なら [`Config::default`] を返す
/// 3. 存在する場合は `serde_json::from_str::<Config>` でパースする
///
/// # Default を返す条件
///
/// 関数名の `_or_default` は **「`config.json` が存在しないとき」のみ** Default を
/// 返すことを意味する。読み込み I/O の失敗 / JSON パースの失敗は `Err` として
/// 返却され、呼び出し層（Tauri コマンド層など）が必要に応じて
/// [`Config::default`] へのフォールバック判断 + 通知を行う想定
/// （仕様書「読み込み失敗 → デフォルト + トースト」は呼び出し層の責務として切り出す）。
///
/// # Errors
///
/// - `.spec-board/` の作成 / アクセスに失敗 → [`LoadConfigError::Io`]
/// - `config.json` の読み取りに失敗 → [`LoadConfigError::Io`]
/// - `config.json` のパースに失敗 → [`LoadConfigError::Parse`]
pub fn load_or_default(project_root: &Path) -> Result<Config, LoadConfigError> {
    config_io::ensure_spec_board_dir(project_root)?;
    let raw = config_io::read_config_json(project_root)?;
    match raw {
        None => Ok(Config::default()),
        Some(content) => {
            serde_json::from_str::<Config>(&content).map_err(|source| LoadConfigError::Parse {
                path: config_io::config_path(project_root),
                source,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ───────── Default ─────────

    #[test]
    fn default_returns_spec_baseline_columns_and_done_column() {
        let c = Config::default();
        assert_eq!(c.version, 1);
        assert_eq!(
            c.columns,
            vec![
                Column {
                    name: "Todo".into(),
                    order: 0,
                },
                Column {
                    name: "In Progress".into(),
                    order: 1,
                },
                Column {
                    name: "Done".into(),
                    order: 2,
                },
            ]
        );
        assert!(c.card_order.is_empty());
        assert_eq!(c.done_column.as_deref(), Some("Done"));
    }

    // ───────── Round-trip ─────────

    #[test]
    fn roundtrip_spec_example_json() {
        let json_in = r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "In Progress", "order": 1 },
                { "name": "Done", "order": 2 }
            ],
            "cardOrder": {
                "Todo": ["tasks/task-a.md", "tasks/task-b.md"],
                "In Progress": ["tasks/task-c.md"],
                "Done": []
            },
            "doneColumn": "Done"
        }"#;

        let parsed: Config = serde_json::from_str(json_in).unwrap();
        let value = serde_json::to_value(&parsed).unwrap();
        let reparsed: Config = serde_json::from_value(value).unwrap();
        assert_eq!(parsed, reparsed);

        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.columns.len(), 3);
        assert_eq!(
            parsed.columns[0],
            Column {
                name: "Todo".into(),
                order: 0
            }
        );
        assert_eq!(parsed.card_order.get("Todo").unwrap().len(), 2);
        assert_eq!(parsed.done_column.as_deref(), Some("Done"));
    }

    #[test]
    fn column_roundtrip() {
        let cases: Vec<(&str, Column)> = vec![
            (
                r#"{"name":"Todo","order":0}"#,
                Column {
                    name: "Todo".into(),
                    order: 0,
                },
            ),
            (
                r#"{"name":"In Progress","order":1}"#,
                Column {
                    name: "In Progress".into(),
                    order: 1,
                },
            ),
        ];
        for (json_in, expected) in cases {
            let parsed: Column = serde_json::from_str(json_in).unwrap();
            assert_eq!(parsed, expected);
            let reparsed: Column =
                serde_json::from_value(serde_json::to_value(&parsed).unwrap()).unwrap();
            assert_eq!(parsed, reparsed);
        }
    }

    // ───────── Optional 省略 ─────────

    #[test]
    fn parses_with_done_column_absent() {
        let json_in = r#"{
            "version": 1,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {}
        }"#;
        let parsed: Config = serde_json::from_str(json_in).unwrap();
        assert_eq!(parsed.done_column, None);
    }

    #[test]
    fn parses_with_done_column_null() {
        let json_in = r#"{
            "version": 1,
            "columns": [{ "name": "Todo", "order": 0 }],
            "cardOrder": {},
            "doneColumn": null
        }"#;
        let parsed: Config = serde_json::from_str(json_in).unwrap();
        assert_eq!(parsed.done_column, None);
    }

    #[test]
    fn serialize_omits_done_column_when_none() {
        let c = Config {
            done_column: None,
            ..Config::default()
        };
        let v = serde_json::to_value(&c).unwrap();
        let obj = v.as_object().unwrap();
        assert!(
            !obj.contains_key("doneColumn"),
            "doneColumn key must be omitted when None"
        );
        assert!(
            !obj.contains_key("done_column"),
            "snake_case must not be emitted"
        );
    }

    // ───────── camelCase キー名 ─────────

    #[test]
    fn field_names_are_camel_case_in_json() {
        let c = Config {
            version: 1,
            columns: vec![Column {
                name: "Todo".into(),
                order: 0,
            }],
            card_order: BTreeMap::from([("Todo".to_string(), vec!["tasks/a.md".to_string()])]),
            done_column: Some("Todo".into()),
        };
        let v = serde_json::to_value(&c).unwrap();
        let obj = v.as_object().unwrap();
        assert!(obj.contains_key("version"));
        assert!(obj.contains_key("columns"));
        assert!(obj.contains_key("cardOrder"));
        assert!(obj.contains_key("doneColumn"));
        assert!(!obj.contains_key("card_order"));
        assert!(!obj.contains_key("done_column"));
    }

    // ───────── 決定論的キー順 (BTreeMap) ─────────

    #[test]
    fn card_order_keys_are_serialized_in_sorted_order() {
        let mut card_order = CardOrder::new();
        card_order.insert("Done".into(), vec![]);
        card_order.insert("Todo".into(), vec!["tasks/a.md".into()]);
        card_order.insert("In Progress".into(), vec!["tasks/b.md".into()]);
        let c = Config {
            version: 1,
            columns: vec![],
            card_order,
            done_column: None,
        };

        let json = serde_json::to_string(&c).unwrap();
        let done_pos = json.find("\"Done\"").unwrap();
        let in_progress_pos = json.find("\"In Progress\"").unwrap();
        let todo_pos = json.find("\"Todo\"").unwrap();
        assert!(
            done_pos < in_progress_pos && in_progress_pos < todo_pos,
            "BTreeMap keys must be serialized in ascending order: got {json}"
        );
    }

    // ───────── 未知フィールドは ignore ─────────

    #[test]
    fn unknown_fields_are_ignored() {
        let json_in = r#"{
            "version": 1,
            "columns": [],
            "cardOrder": {},
            "futureFlag": "ignored"
        }"#;
        let parsed: Config = serde_json::from_str(json_in).unwrap();
        assert_eq!(parsed.version, 1);
        assert!(parsed.columns.is_empty());
        assert!(parsed.card_order.is_empty());
        assert_eq!(parsed.done_column, None);
    }

    // ───────── 必須フィールド欠落 → parse エラー ─────────

    #[test]
    fn empty_object_fails_to_parse() {
        let err = serde_json::from_str::<Config>("{}").unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("version"),
            "expected error to mention required field: {msg}"
        );
    }

    #[test]
    fn missing_columns_fails_to_parse() {
        let json_in = r#"{ "version": 1, "cardOrder": {} }"#;
        let err = serde_json::from_str::<Config>(json_in).unwrap_err();
        assert!(
            err.to_string().contains("columns"),
            "expected error to mention `columns`: {err}"
        );
    }

    #[test]
    fn missing_card_order_fails_to_parse() {
        let json_in = r#"{ "version": 1, "columns": [{ "name": "Todo", "order": 0 }] }"#;
        let err = serde_json::from_str::<Config>(json_in).unwrap_err();
        assert!(
            err.to_string().contains("cardOrder"),
            "expected error to mention `cardOrder`: {err}"
        );
    }

    // ───────── Config::resolved_done_column ─────────

    #[test]
    fn resolved_done_column_parametrized() {
        fn col(name: &str, order: u32) -> Column {
            Column {
                name: name.into(),
                order,
            }
        }

        struct Case {
            label: &'static str,
            done_column: Option<&'static str>,
            columns: Vec<Column>,
            expected: Option<&'static str>,
        }

        let cases: Vec<Case> = vec![
            Case {
                label: "Some(Done) returns Some(Done)",
                done_column: Some("Done"),
                columns: vec![col("Todo", 0), col("In Progress", 1), col("Done", 2)],
                expected: Some("Done"),
            },
            Case {
                label: "None + 空 columns → None",
                done_column: None,
                columns: vec![],
                expected: None,
            },
            Case {
                label: "None + 単一 columns → そのカラム名",
                done_column: None,
                columns: vec![col("Todo", 0)],
                expected: Some("Todo"),
            },
            Case {
                label: "None + 3 カラム → order 最大の Done",
                done_column: None,
                columns: vec![col("Todo", 0), col("In Progress", 1), col("Done", 2)],
                expected: Some("Done"),
            },
            Case {
                label: "Some(Custom) は columns に無くても素通し",
                done_column: Some("Custom"),
                columns: vec![col("Todo", 0), col("Done", 1)],
                expected: Some("Custom"),
            },
            Case {
                label: "配列順が order 昇順でなくても order 最大が返る",
                done_column: None,
                columns: vec![col("Done", 2), col("Todo", 0), col("In Progress", 1)],
                expected: Some("Done"),
            },
            Case {
                label: "同一 order の場合は最後に現れた要素",
                done_column: None,
                columns: vec![col("A", 1), col("B", 1)],
                expected: Some("B"),
            },
        ];

        for case in cases {
            let cfg = Config {
                version: 1,
                columns: case.columns,
                card_order: BTreeMap::new(),
                done_column: case.done_column.map(|s| s.to_string()),
            };
            assert_eq!(
                cfg.resolved_done_column(),
                case.expected,
                "case: {}",
                case.label
            );
        }
    }

    // ───────── load_or_default ─────────

    use tempfile::TempDir;

    #[test]
    fn load_or_default_creates_dir_and_returns_default_when_nothing_exists() {
        let tmp = TempDir::new().unwrap();
        let cfg = load_or_default(tmp.path()).unwrap();
        assert_eq!(cfg, Config::default());
        assert!(tmp.path().join(".spec-board").is_dir());
    }

    #[test]
    fn load_or_default_returns_default_when_only_dir_exists() {
        let tmp = TempDir::new().unwrap();
        std::fs::create_dir(tmp.path().join(".spec-board")).unwrap();

        let cfg = load_or_default(tmp.path()).unwrap();
        assert_eq!(cfg, Config::default());
    }

    #[test]
    fn load_or_default_parses_existing_config_json() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join(".spec-board");
        std::fs::create_dir(&dir).unwrap();
        let content = r#"{
            "version": 1,
            "columns": [
                { "name": "Todo", "order": 0 },
                { "name": "Done", "order": 1 }
            ],
            "cardOrder": {
                "Todo": ["tasks/a.md"],
                "Done": []
            },
            "doneColumn": null
        }"#;
        std::fs::write(dir.join("config.json"), content).unwrap();

        let cfg = load_or_default(tmp.path()).unwrap();
        assert_eq!(cfg.version, 1);
        assert_eq!(cfg.columns.len(), 2);
        assert_eq!(cfg.done_column, None);
        // done_column が無くても resolved_done_column は末尾カラムを返す
        assert_eq!(cfg.resolved_done_column(), Some("Done"));
    }

    #[test]
    fn load_or_default_returns_parse_err_for_invalid_json() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join(".spec-board");
        std::fs::create_dir(&dir).unwrap();
        std::fs::write(dir.join("config.json"), "{not valid json").unwrap();

        let err = load_or_default(tmp.path()).unwrap_err();
        match err {
            LoadConfigError::Parse { path, .. } => {
                assert_eq!(path, dir.join("config.json"));
            }
            other => panic!("expected Parse error, got {other:?}"),
        }
    }

    #[test]
    fn load_or_default_returns_io_err_when_project_root_missing() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("does-not-exist");

        let err = load_or_default(&missing).unwrap_err();
        match err {
            LoadConfigError::Io(_) => {}
            other => panic!("expected Io error, got {other:?}"),
        }
    }

    // ───────── build_config_from_statuses ─────────

    fn col(name: &str, order: u32) -> Column {
        Column {
            name: name.into(),
            order,
        }
    }

    fn pb(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn build_config_from_statuses_parametrized() {
        struct Case {
            label: &'static str,
            inputs: Vec<(PathBuf, Option<String>)>,
            expected_columns: Vec<Column>,
            expected_done: Option<&'static str>,
        }

        let cases: Vec<Case> = vec![
            Case {
                label: "0 件 -> 空 Config",
                inputs: vec![],
                expected_columns: vec![],
                expected_done: None,
            },
            Case {
                label: "全 None -> Todo 1 件",
                inputs: vec![(pb("a.md"), None), (pb("b.md"), None)],
                expected_columns: vec![col("Todo", 0)],
                expected_done: Some("Todo"),
            },
            Case {
                label: "単一 Some(Doing)",
                inputs: vec![(pb("a.md"), Some("Doing".into()))],
                expected_columns: vec![col("Doing", 0)],
                expected_done: Some("Doing"),
            },
            Case {
                label: "Todo / Doing / Done 出現順",
                inputs: vec![
                    (pb("a.md"), Some("Todo".into())),
                    (pb("b.md"), Some("Doing".into())),
                    (pb("c.md"), Some("Done".into())),
                ],
                expected_columns: vec![col("Todo", 0), col("Doing", 1), col("Done", 2)],
                expected_done: Some("Done"),
            },
            Case {
                label: "重複 Todo 2 件 -> 1 列",
                inputs: vec![
                    (pb("a.md"), Some("Todo".into())),
                    (pb("b.md"), Some("Todo".into())),
                ],
                expected_columns: vec![col("Todo", 0)],
                expected_done: Some("Todo"),
            },
            Case {
                label: "None + Some(Doing) 混在",
                inputs: vec![(pb("a.md"), None), (pb("b.md"), Some("Doing".into()))],
                expected_columns: vec![col("Todo", 0), col("Doing", 1)],
                expected_done: Some("Doing"),
            },
            Case {
                label: "実出現 Todo + None は同一名にまとまる",
                inputs: vec![(pb("a.md"), Some("Todo".into())), (pb("b.md"), None)],
                expected_columns: vec![col("Todo", 0)],
                expected_done: Some("Todo"),
            },
            Case {
                label: "空文字 Some(\"\") はそのまま採用",
                inputs: vec![(pb("a.md"), Some("".into()))],
                expected_columns: vec![col("", 0)],
                expected_done: Some(""),
            },
            Case {
                label: "空白のみ Some(\" \") はそのまま採用",
                inputs: vec![(pb("a.md"), Some(" ".into()))],
                expected_columns: vec![col(" ", 0)],
                expected_done: Some(" "),
            },
            Case {
                label: "前後空白 Some(\"  Todo  \") はそのまま採用（trim しない）",
                inputs: vec![(pb("a.md"), Some("  Todo  ".into()))],
                expected_columns: vec![col("  Todo  ", 0)],
                expected_done: Some("  Todo  "),
            },
            Case {
                label: "ネストパスの path 昇順（PathBuf::Ord）",
                inputs: vec![
                    (pb("tasks/a.md"), Some("X".into())),
                    (pb("tasks/sub/b.md"), Some("Y".into())),
                    (pb("b.md"), Some("Z".into())),
                ],
                expected_columns: vec![col("Z", 0), col("X", 1), col("Y", 2)],
                expected_done: Some("Y"),
            },
            Case {
                label: "Unicode ファイル名の path 昇順（UTF-8 バイト列比較）",
                inputs: vec![
                    (pb("α.md"), Some("ALPHA".into())),
                    (pb("タスク.md"), Some("TASK".into())),
                    (pb("a.md"), Some("A".into())),
                ],
                expected_columns: vec![col("A", 0), col("ALPHA", 1), col("TASK", 2)],
                expected_done: Some("TASK"),
            },
        ];

        for case in cases {
            let cfg = build_config_from_statuses(&case.inputs);
            assert_eq!(cfg.version, 1, "case: {}", case.label);
            assert_eq!(cfg.columns, case.expected_columns, "case: {}", case.label);
            assert_eq!(
                cfg.done_column.as_deref(),
                case.expected_done,
                "case: {}",
                case.label
            );
            assert!(
                cfg.card_order.is_empty(),
                "card_order must be empty: case: {}",
                case.label
            );
        }
    }

    #[test]
    fn build_config_from_statuses_defensive_sort_normalizes_input_order() {
        let asc = vec![
            (pb("a.md"), Some("X".into())),
            (pb("b.md"), Some("Y".into())),
        ];
        let desc = vec![
            (pb("b.md"), Some("Y".into())),
            (pb("a.md"), Some("X".into())),
        ];
        let cfg_asc = build_config_from_statuses(&asc);
        let cfg_desc = build_config_from_statuses(&desc);
        assert_eq!(cfg_asc, cfg_desc);
        assert_eq!(
            cfg_asc.columns,
            vec![col("X", 0), col("Y", 1)],
            "path 昇順で X が先になる"
        );
    }
}
