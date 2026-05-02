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
//! [`Config::default`] は `version = 1`、空コレクション、`done_column = None` を返す。
//! 「完了」カラム名のフォールバック解決（最後のカラムを使う等）は呼び出し層の責務。
//!
//! # スコープ外（別 Issue で実装）
//! - ファイル I/O（読み書き）
//! - バリデーション（columns 重複・doneColumn 整合性）
//! - 初期化フロー / マイグレーション
//! - Tauri コマンド層

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// `cardOrder` の型エイリアス。キー = カラム名、値 = タスクファイルパスの並び順配列。
/// 順序は config 上で意味を持たないため `HashMap` を用いる（`Vec<String>` 内の順序が表示順）。
pub type CardOrder = HashMap<String, Vec<String>>;

/// プロジェクト設定全体。
///
/// `version` / `columns` / `card_order` は仕様上「必須: はい」だが、
/// 部分的な手書き JSON でも壊れにくくするため、
/// 欠落フィールドはフィールド単位の serde default で補完する
/// （`Config::default()` 自体は呼ばれない）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// 設定ファイルのスキーマバージョン。デフォルト `1`。
    #[serde(default = "default_version")]
    pub version: u32,
    /// カラム定義の配列。順序は `Column::order` 昇順で表示する想定（ソートは呼び出し側）。
    #[serde(default)]
    pub columns: Vec<Column>,
    /// カラム名 → そのカラム内のタスクファイルパス配列。空 `{}` を許容。
    #[serde(default)]
    pub card_order: CardOrder,
    /// 「完了」として扱うカラム名。未設定時は `columns` の最後のカラムを呼び出し層で採用する。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done_column: Option<String>,
}

const DEFAULT_VERSION: u32 = 1;

fn default_version() -> u32 {
    DEFAULT_VERSION
}

/// カラム（ステータス）定義。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Column {
    /// カラム名。タスクのフロントマター `status` と対応する。
    pub name: String,
    /// カラムの表示順序（0 始まり昇順を想定。連番である必要はない）。
    pub order: u32,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: DEFAULT_VERSION,
            columns: Vec::new(),
            card_order: HashMap::new(),
            done_column: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ───────── Default ─────────

    #[test]
    fn default_returns_version_1_and_empty_collections() {
        let c = Config::default();
        assert_eq!(c.version, 1);
        assert!(c.columns.is_empty());
        assert!(c.card_order.is_empty());
        assert_eq!(c.done_column, None);
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
            card_order: HashMap::from([("Todo".to_string(), vec!["tasks/a.md".to_string()])]),
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
        assert_eq!(parsed, Config::default());
    }

    // ───────── 必須フィールド欠落 → Default フォールバック ─────────

    #[test]
    fn parses_empty_object_as_default() {
        let parsed: Config = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed, Config::default());
    }

    #[test]
    fn parses_with_only_columns_supplied() {
        let json_in = r#"{ "columns": [{ "name": "Todo", "order": 0 }] }"#;
        let parsed: Config = serde_json::from_str(json_in).unwrap();
        assert_eq!(parsed.version, 1);
        assert_eq!(parsed.columns.len(), 1);
        assert!(parsed.card_order.is_empty());
        assert_eq!(parsed.done_column, None);
    }
}
