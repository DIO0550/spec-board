//! プロジェクト設定 `.spec-board/config.json` のコアスキーマ型とドメインロジック。
//!
//! [`Config`] / [`Column`] / [`ColumnColor`] と、`cardOrder` 型エイリアス [`CardOrder`]、
//! GUIDE.md 本文生成、`update_columns` 純粋計算（[`Config::plan_update_columns`]）、
//! status 列からの config 組み立て（[`build_config_from_statuses`]）、
//! `cardOrder` クレンジング（[`clean_card_order`]）、カラム名重複検証
//! （[`validate_unique_column_names`]）を提供する。
//!
//! # serde 規約
//! 型レベルで `#[serde(rename_all = "camelCase")]` を付与し、
//! Rust 側 snake_case フィールドを JSON 側 camelCase キーへ自動マッピングする。
//!
//! - `card_order` ↔ `cardOrder`
//! - `done_column` ↔ `doneColumn`

use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};
use thiserror::Error;

use crate::config::column_name::ColumnName;
use crate::config::update_columns::{ColumnRename, UpdateColumnsArgs, UpdateColumnsError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use spec_board_fs::config::config_io::write_guide_markdown;

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
    pub done_column: Option<ColumnName>,
}

pub(crate) const DEFAULT_VERSION: u32 = 1;

/// `#rrggbb` 形式のカラムアクセント色 VO。constructor で形式を強制し、
/// 大文字を小文字へ正規化して保持する（`#ABCDEF` → `#abcdef`）。
///
/// `Deserialize` は derive せず、フィールド側の関連関数 [`ColumnColor::deserialize_opt`]
/// 経由でのみ生成する（不正値を `None` に倒すため）。`columns[].color` は config.json
/// （JSON）に載るため、`serde_yaml_ng::Value` ではなく `serde_json::Value` で受ける。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ColumnColor(String);

impl ColumnColor {
    /// `#RRGGBB`（`#` + 16 進 6 桁）のみ受理し、小文字へ正規化して保持する。それ以外は `None`。
    pub fn from_hex(raw: &str) -> Option<Self> {
        let is_valid = raw.len() == 7
            && raw.starts_with('#')
            && raw[1..].bytes().all(|b| b.is_ascii_hexdigit());
        is_valid.then(|| Self(raw.to_ascii_lowercase()))
    }

    /// 保持している `#rrggbb` 文字列を返す。
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// `color` フィールドの lenient deserialize。`serde_json::Value` で一旦受け、
    /// 「文字列かつ `#RRGGBB` 妥当」のみ `Some(ColumnColor)`、それ以外（不正文字列 /
    /// 数値 / null）は `None` に倒す。**エラーにしない**。
    fn deserialize_opt<'de, D>(de: D) -> Result<Option<ColumnColor>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(de)?;
        Ok(value.as_str().and_then(ColumnColor::from_hex))
    }
}

/// カラム（ステータス）定義。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Column {
    /// カラム名。タスクのフロントマター `status` と対応する。
    pub name: ColumnName,
    /// カラムの表示順序（0 始まり昇順を想定。連番である必要はない）。
    pub order: u32,
    /// カラムヘッダーのアクセント色（任意）。`#RRGGBB` 妥当値のみ保持し、
    /// 不正・欠落時は `None`。`None` のときは serialize で `color` キーごと省略する。
    #[serde(
        default,
        deserialize_with = "ColumnColor::deserialize_opt",
        skip_serializing_if = "Option::is_none"
    )]
    pub color: Option<ColumnColor>,
}

/// プロジェクト初回オープン時のデフォルト、および config 読み込み失敗時の
/// フォールバックで用いるベースラインカラム名。
pub(crate) const DEFAULT_COLUMN_NAMES: [&str; 3] = ["Todo", "In Progress", "Done"];

/// GUIDE.md 文字列生成において、入力 columns が空の場合に `status:` 例へ使う値。
const GUIDE_STATUS_FALLBACK: &str = DEFAULT_COLUMN_NAMES[0];

struct GuideMarkdownParts<'a> {
    status_example: &'a str,
    status_names: Vec<&'a str>,
}

impl Default for Config {
    fn default() -> Self {
        let columns = DEFAULT_COLUMN_NAMES
            .iter()
            .enumerate()
            .map(|(i, name)| Column {
                name: ColumnName::from_lenient(*name),
                order: i as u32,
                color: None,
            })
            .collect();
        let done_column = DEFAULT_COLUMN_NAMES
            .last()
            .map(|s| ColumnName::from_lenient(*s));
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
    pub fn resolved_done_column(&self) -> Option<&ColumnName> {
        if let Some(name) = self.done_column.as_ref() {
            return Some(name);
        }
        self.columns.iter().max_by_key(|c| c.order).map(|c| &c.name)
    }

    /// 指定された名前のカラムが [`Self::columns`] に存在するかを返す。
    ///
    /// 比較は完全一致（case-sensitive）。`cardOrder` の更新前に
    /// 「未知のカラムに対する書き込み」を弾くプリチェックとして利用する。
    pub fn has_column(&self, name: &str) -> bool {
        self.columns.iter().any(|c| c.name.as_str() == name)
    }

    /// この設定から GUIDE.md の Markdown 本文を生成する。
    ///
    /// # Returns
    ///
    /// `.spec-board/GUIDE.md` に書き込む候補となる Markdown 文字列。末尾改行を含む。
    pub fn guide_markdown(&self) -> String {
        generate_guide_markdown(self)
    }

    /// `update_columns` の純粋計算部。引数と現在のタスクスナップショットから
    /// 新しい `Config`・rename 対象タスク・no-op フラグを組み立てる。
    ///
    /// 検証順序は renames → columns → doneColumn。`args.columns` 指定時は
    /// FE 提供の最終形をそのまま採用し、aggregate 側で order の再採番は行わない。
    ///
    /// # Errors
    ///
    /// - `EmptyColumns` — 最終 columns 候補が空
    /// - `DuplicateColumnName` — rename 適用後の名前空間で重複
    /// - `UnknownRenameFrom` — `rename.from` が現在の columns に存在しない
    /// - `DuplicateRenameFrom` — 同じ `from` を複数 rename で指定
    /// - `EmptyRenameTo` — `rename.to` が空
    /// - `UnknownDoneColumn` — `doneColumn` が新 columns に存在しない
    /// - `RenameToMissingFromColumns` — `args.columns` と renames を同時指定した
    ///   際に `rename.to` が新 columns に含まれていない
    pub fn plan_update_columns(
        &self,
        args: &UpdateColumnsArgs,
        tasks: &[Task],
    ) -> Result<UpdateColumnsPlan, UpdateColumnsError> {
        // 空配列の `renames: []` は「未指定」と同義扱いにする。
        // `is_some()` のままだと空配列だけが送られた場合に no-op 判定にならず、
        // config.json / GUIDE.md が無意味に再書き込みされてしまうため。
        let has_renames = args.renames.as_ref().is_some_and(|v| !v.is_empty());
        if args.columns.is_none() && args.done_column.is_none() && !has_renames {
            return Ok(UpdateColumnsPlan {
                new_config: self.clone(),
                rename_targets: Vec::new(),
                is_noop: true,
            });
        }

        let rename_map = build_rename_map(self, args.renames.as_deref().unwrap_or(&[]))?;

        let candidate_columns = match args.columns.as_ref() {
            Some(cols) => cols.clone(),
            None => apply_renames_to_columns(&self.columns, &rename_map),
        };

        if candidate_columns.is_empty() {
            return Err(UpdateColumnsError::EmptyColumns);
        }

        validate_unique_column_names(&candidate_columns)
            .map_err(|name| UpdateColumnsError::DuplicateColumnName { name })?;

        if args.columns.is_some() && !rename_map.is_empty() {
            for to in rename_map.values() {
                if !candidate_columns
                    .iter()
                    .any(|c| c.name.as_str() == to.as_str())
                {
                    return Err(UpdateColumnsError::RenameToMissingFromColumns {
                        name: to.clone(),
                    });
                }
            }
        }

        let new_done: Option<ColumnName> = match args.done_column.as_deref() {
            Some(name) => Some(ColumnName::from_lenient(name)),
            None => self
                .done_column
                .as_ref()
                .map(|c| match rename_map.get(c.as_str()) {
                    Some(new_name) => ColumnName::from_lenient(new_name),
                    None => c.clone(),
                }),
        };

        if let Some(d) = &new_done {
            if !candidate_columns
                .iter()
                .any(|c| c.name.as_str() == d.as_str())
            {
                return Err(UpdateColumnsError::UnknownDoneColumn {
                    name: d.as_str().to_string(),
                });
            }
        }

        let valid_names: HashSet<&str> =
            candidate_columns.iter().map(|c| c.name.as_str()).collect();
        let mut new_card_order: CardOrder = BTreeMap::new();
        for (key, paths) in &self.card_order {
            let new_key = rename_map
                .get(key.as_str())
                .cloned()
                .unwrap_or_else(|| key.clone());
            if !valid_names.contains(new_key.as_str()) {
                continue;
            }
            // 複数の旧キーが同じ new_key に collapse する場合（例: args.columns で
            // 残す側として B のみ指定 + rename A→B が指定され、旧 card_order に
            // A と B 両方の entry がある）に paths を後勝ち上書きしないよう、
            // 既存 Vec へ append + 重複除去（first-occurrence wins）でマージする。
            let entry = new_card_order.entry(new_key).or_default();
            for path in paths {
                if !entry.contains(path) {
                    entry.push(path.clone());
                }
            }
        }

        let mut rename_targets: Vec<RenameTarget> = Vec::new();
        for task in tasks {
            let status_str = task.status.as_str();
            if let Some(new_status) = rename_map.get(status_str) {
                rename_targets.push(RenameTarget {
                    rel_path: task.file_path.clone(),
                    old_status: status_str.to_string(),
                    new_status: new_status.clone(),
                });
            }
        }

        Ok(UpdateColumnsPlan {
            new_config: Config {
                version: self.version,
                columns: candidate_columns,
                card_order: new_card_order,
                done_column: new_done,
            },
            rename_targets,
            is_noop: false,
        })
    }

    /// cardOrder の canonical membership を保証する正規化メソッド。
    ///
    /// 2 段階で正規化する:
    /// 1. 同一カラム内の重複パスを除去（first occurrence wins）
    /// 2. 列跨ぎ重複を解消（columns の order 昇順走査で first occurrence が winner）
    ///
    /// `&self` を借用し、正規化済みの新しい `Config` を返す。
    /// 第 2 返却値は「入力と出力が異なるか」を表す。
    pub fn normalize_card_order(&self) -> (Config, bool) {
        let mut changed = false;
        let mut normalized: CardOrder = BTreeMap::new();

        for (key, paths) in &self.card_order {
            let mut seen = HashSet::new();
            let deduped: Vec<String> = paths
                .iter()
                .filter(|p| seen.insert(p.as_str()))
                .cloned()
                .collect();
            if deduped.len() != paths.len() {
                changed = true;
            }
            normalized.insert(key.clone(), deduped);
        }

        // columns を order 昇順にソートし、その順で走査する。
        // columns に存在しないキーは末尾に（BTreeMap キー辞書順で）走査する。
        let column_order: Vec<&str> = {
            let mut sorted: Vec<&Column> = self.columns.iter().collect();
            sorted.sort_by(|a, b| a.order.cmp(&b.order).then_with(|| a.name.cmp(&b.name)));
            sorted.iter().map(|c| c.name.as_str()).collect()
        };
        let all_keys: Vec<String> = normalized.keys().cloned().collect();
        let ordered_keys: Vec<String> = column_order
            .iter()
            .filter(|k| all_keys.contains(&k.to_string()))
            .map(|k| k.to_string())
            .chain(
                all_keys
                    .iter()
                    .filter(|k| !column_order.contains(&k.as_str()))
                    .cloned(),
            )
            .collect();

        let mut global_seen: HashSet<String> = HashSet::new();
        let mut removals: HashMap<String, HashSet<String>> = HashMap::new();
        for key in &ordered_keys {
            let Some(paths) = normalized.get(key) else {
                continue;
            };
            for path in paths {
                if !global_seen.insert(path.clone()) {
                    removals
                        .entry(key.clone())
                        .or_default()
                        .insert(path.clone());
                }
            }
        }

        for (key, to_remove) in &removals {
            if let Some(paths) = normalized.get_mut(key) {
                paths.retain(|p| !to_remove.contains(p));
                changed = true;
            }
        }

        let result = Config {
            card_order: normalized,
            ..self.clone()
        };
        (result, changed)
    }

    /// `cardOrder[column_name]` を `file_paths` で上書きした新しい `Config` を返す
    /// （副作用なし）。
    ///
    /// `column_name` が [`Self::columns`] に存在しなければ
    /// [`UpdateCardOrderPlanError::UnknownColumn`] を返し、`self` は変更しない。
    /// `file_paths` のうち `existing_paths` に含まれないエントリは
    /// 「実体が消えたタスク」として除外する。入力順は保持する。
    ///
    /// 実在判定の走査（fs アクセス）は呼び出し側の責務で、本メソッドは
    /// `existing_paths` を真値として扱う純粋関数。これにより
    /// 「未知カラムの拒否」「除去ルール」という cardOrder のドメイン不変条件を
    /// aggregate 側に集約する。
    ///
    /// # Errors
    ///
    /// - [`UpdateCardOrderPlanError::UnknownColumn`] — `column_name` が
    ///   [`Self::columns`] のいずれにも一致しない
    pub fn plan_update_card_order(
        &self,
        column_name: String,
        file_paths: Vec<String>,
        existing_paths: &HashSet<String>,
    ) -> Result<Config, UpdateCardOrderPlanError> {
        if !self.has_column(&column_name) {
            return Err(UpdateCardOrderPlanError::UnknownColumn { column_name });
        }

        let retained: Vec<String> = file_paths
            .into_iter()
            .filter(|rel| existing_paths.contains(rel.as_str()))
            .collect();

        let mut next = self.clone();
        next.card_order.insert(column_name, retained);
        Ok(next)
    }
}

/// `Config::plan_update_columns` の戻り値。
#[derive(Debug, Clone, PartialEq)]
pub struct UpdateColumnsPlan {
    /// 書き出し対象の新しい Config（columns / done_column / card_order すべて反映済み）
    pub new_config: Config,
    /// rename 対象タスクと書き換え後の status 文字列
    pub rename_targets: Vec<RenameTarget>,
    /// 何も変更しない no-op フラグ（args 全 None 時 true）
    pub is_noop: bool,
}

/// [`Config::plan_update_card_order`] の検証失敗。
///
/// 指定カラムが [`Config::columns`] に存在しない場合のみ発生する。effect 層は
/// このバリアントを IPC エラー（`UnknownColumn`）へ詰め替える。
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum UpdateCardOrderPlanError {
    /// 指定された `column_name` が [`Config::columns`] に存在しない。
    #[error("unknown column: `{column_name}`")]
    UnknownColumn { column_name: String },
}

/// rename 対象 1 件分。`rel_path` はプロジェクトルートからの相対パス。
/// effect 層が `project_root.join(rel_path.as_str())` で絶対パスを組み立てる。
#[derive(Debug, Clone, PartialEq)]
pub struct RenameTarget {
    pub rel_path: TaskFilePath,
    pub old_status: String,
    pub new_status: String,
}

/// rename 指示列を `HashMap<from, to>` に正規化する。
///
/// `from == to` は冪等 skip、`to` 空は `EmptyRenameTo`、重複 `from` は
/// `DuplicateRenameFrom`、存在しない `from` は `UnknownRenameFrom` を返す。
fn build_rename_map(
    config: &Config,
    renames: &[ColumnRename],
) -> Result<HashMap<String, String>, UpdateColumnsError> {
    let mut map: HashMap<String, String> = HashMap::new();
    for r in renames {
        if r.from == r.to {
            continue;
        }
        if r.to.is_empty() {
            return Err(UpdateColumnsError::EmptyRenameTo);
        }
        if map.contains_key(&r.from) {
            return Err(UpdateColumnsError::DuplicateRenameFrom {
                name: r.from.clone(),
            });
        }
        if !config.columns.iter().any(|c| c.name.as_str() == r.from) {
            return Err(UpdateColumnsError::UnknownRenameFrom {
                name: r.from.clone(),
            });
        }
        map.insert(r.from.clone(), r.to.clone());
    }
    Ok(map)
}

/// `args.columns` 未指定時の候補 columns を rename_map を適用して派生する。
pub(crate) fn apply_renames_to_columns(
    columns: &[Column],
    rename_map: &HashMap<String, String>,
) -> Vec<Column> {
    columns
        .iter()
        .map(|c| match rename_map.get(c.name.as_str()) {
            Some(new_name) => Column {
                name: ColumnName::from_lenient(new_name),
                order: c.order,
                color: c.color.clone(),
            },
            None => c.clone(),
        })
        .collect()
}

/// [`Config`] から GUIDE.md の Markdown 本文を生成する。
///
/// # Returns
///
/// `.spec-board/GUIDE.md` に書き込む候補となる Markdown 文字列。末尾改行を含む。
pub fn generate_guide_markdown(config: &Config) -> String {
    generate_guide_markdown_for_columns(&config.columns)
}

/// [`Column`] の列から GUIDE.md の Markdown 本文を生成する。
///
/// `columns[].order` 昇順で有効なステータス値を出力する。同一 `order` の場合は
/// 入力順を保持する。カラム名は Markdown escape / trim / normalization を行わず
/// raw のまま出力する。
///
/// # Returns
///
/// `.spec-board/GUIDE.md` に書き込む候補となる Markdown 文字列。末尾改行を含む。
pub fn generate_guide_markdown_for_columns(columns: &[Column]) -> String {
    let parts = build_guide_markdown_parts(columns);
    render_guide_markdown(&parts)
}

/// [`Config::guide_markdown`] の戻り値を `.spec-board/GUIDE.md` へ best-effort で書き込む。
///
/// GUIDE.md は補助ファイルのため、I/O 失敗を呼び出し元へ返さず WARN ログのみを残す。
/// WARN が有効でない環境（logger 未初期化、または WARN レベルが無効）でも
/// 観測できるよう stderr fallback も併用する。
///
/// @param project_root `.spec-board/GUIDE.md` を配置するプロジェクトルート。
/// @param config GUIDE.md 本文生成に使う設定。
pub fn write_guide_markdown_best_effort(project_root: &Path, config: &Config) {
    let content = config.guide_markdown();

    if let Err(error) = write_guide_markdown(project_root, &content) {
        warn_guide_write_failure(project_root, &error);
    }
}

fn warn_guide_write_failure(project_root: &Path, error: &impl std::fmt::Display) {
    let message = format_guide_write_warning(project_root, error);
    warn!("{message}");
    if !log::log_enabled!(log::Level::Warn) {
        eprintln!("WARN {message}");
    }
}

pub(crate) fn format_guide_write_warning(
    project_root: &Path,
    error: &impl std::fmt::Display,
) -> String {
    format!(
        "failed to write .spec-board/GUIDE.md for project '{}': {error}",
        project_root.display()
    )
}

fn build_guide_markdown_parts(columns: &[Column]) -> GuideMarkdownParts<'_> {
    let mut sorted_columns: Vec<&Column> = columns.iter().collect();
    sorted_columns.sort_by_key(|column| column.order);

    let status_example = sorted_columns
        .first()
        .map(|column| column.name.as_str())
        .unwrap_or(GUIDE_STATUS_FALLBACK);
    let status_names = sorted_columns
        .into_iter()
        .map(|column| column.name.as_str())
        .collect();

    GuideMarkdownParts {
        status_example,
        status_names,
    }
}

fn render_guide_markdown(parts: &GuideMarkdownParts<'_>) -> String {
    let mut markdown = format!(
        "# spec-board タスクフォーマットガイド\n\n\
このプロジェクトは spec-board で管理されています。\n\
タスクは以下のフォーマットの Markdown ファイルで管理します。\n\n\
## テンプレート\n\n\
```\n\
---\n\
title: タスクのタイトル（推奨・省略時はファイル名からフォールバック）\n\
status: {}（推奨・省略時は既定カラムにフォールバック。指定する場合は下記の有効な値から選択）\n\
priority: Medium（任意・High / Medium / Low）\n\
labels:（任意）\n\
  - ラベル名\n\
parent: tasks/parent-task.md（任意・親タスクのパス）\n\
links:（任意）\n\
  - tasks/related-task.md\n\
---\n\n\
タスクの詳細説明\n\
```\n\n\
## 有効なステータス値\n\n",
        parts.status_example
    );

    for status_name in &parts.status_names {
        markdown.push_str("- ");
        markdown.push_str(status_name);
        markdown.push('\n');
    }

    if !parts.status_names.is_empty() {
        markdown.push('\n');
    }

    markdown.push_str(
        "## ルール\n\n\
- ファイルは `.md` 拡張子で作成してください\n\
- `.spec-board/` ディレクトリ内のファイルは編集しないでください\n\
- `parent` に指定するパスはプロジェクトルートからの相対パスです\n",
    );

    markdown
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
///     ソートは [`PathBuf`] の `Ord` 実装（OS の `OsStr` 表現順序）に従い、
///     project-root からの相対パスでの比較が前提。
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

    let mut order: Vec<usize> = (0..inputs.len()).collect();
    order.sort_by(|&a, &b| inputs[a].0.cmp(&inputs[b].0));

    let fallback: &str = DEFAULT_COLUMN_NAMES[0];
    let mut seen: HashSet<&str> = HashSet::with_capacity(inputs.len());
    let mut names: Vec<String> = Vec::with_capacity(inputs.len());
    for &i in &order {
        let name: &str = inputs[i].1.as_deref().unwrap_or(fallback);
        if seen.insert(name) {
            names.push(name.to_string());
        }
    }

    let columns: Vec<Column> = names
        .into_iter()
        .enumerate()
        .map(|(i, name)| Column {
            name: ColumnName::from_lenient(name),
            order: i as u32,
            color: None,
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

/// `cardOrder` から「実体が消えたファイルパス」「`columns` に存在しないキー」を取り除いた
/// 新しい [`CardOrder`] を返す純粋関数。
///
/// # 入力規約
/// - `card_order`: 元の `cardOrder`（`BTreeMap<String, Vec<String>>`）。借用のみで変更しない。
/// - `columns`: 現在のカラム定義スライス。`columns[].name` をキー存続判定に用いる。
/// - `existing_paths`: プロジェクト上で実在するタスクファイルの相対パス集合。
///   走査は呼び出し側責務（本関数は fs にアクセスしない）。
///
/// # 戻り値
/// - 新規 [`CardOrder`]。in-place mutation はしない。
///
/// # 削除ルール
/// 1. 各カラム値の `Vec<String>` から `existing_paths` に含まれないエントリを除去する。
/// 2. キーが `columns[].name` のいずれにも一致しない場合、そのキーごと除去する。
/// 3. 除去結果として値が空 `Vec` になっても、キーは保持する（カラムの初期状態を表す）。
///
/// # 決定論性
/// 戻り値は `BTreeMap` のためキー順序はキー昇順で決定論的。値の `Vec` は元の順序を保持する。
///
/// # 重複パスの扱い
/// 値配列内の重複パス除去は [`Config::normalize_card_order`] が担当する。
/// 本関数は「存在しないパスの除去」のみを担当し、重複除去は行わない。
///
/// # 例
/// ```ignore
/// use std::collections::{BTreeMap, HashSet};
/// let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
/// map.insert("Todo".into(), vec!["a.md".into(), "x.md".into()]);
/// let columns = vec![Column { name: "Todo".into(), order: 0, color: None }];
/// let mut existing: HashSet<String> = HashSet::new();
/// existing.insert("a.md".to_string());
/// let cleaned = clean_card_order(&map, &columns, &existing);
/// assert_eq!(cleaned.get("Todo").unwrap(), &vec!["a.md".to_string()]);
/// ```
pub fn clean_card_order(
    card_order: &CardOrder,
    columns: &[Column],
    existing_paths: &HashSet<String>,
) -> CardOrder {
    let valid_keys: HashSet<&str> = columns.iter().map(|c| c.name.as_str()).collect();

    let mut cleaned: CardOrder = BTreeMap::new();
    for (key, paths) in card_order.iter() {
        if !valid_keys.contains(key.as_str()) {
            continue;
        }
        let filtered: Vec<String> = paths
            .iter()
            .filter(|p| existing_paths.contains(p.as_str()))
            .cloned()
            .collect();
        cleaned.insert(key.clone(), filtered);
    }
    cleaned
}

/// `Config::columns` のカラム名重複を検証する純粋関数。
///
/// 完全一致比較。最初に見つけた重複名を `Err(name)` で返す。大文字小文字違い
/// （例: `"Todo"` vs `"todo"`）は別カラム扱いで `Ok(())`。
///
/// 入力値はそのまま完全一致比較する（未正規化のまま）。空文字 `""` / 空白のみ
/// `" "` / 前後空白付き `"  Todo  "` は値そのものを比較対象とし、本関数では
/// 空文字や空白を別エラーとして拒否しない（[`build_config_from_statuses`] が
/// status 入力を未正規化のまま受ける規約と一貫させる）。
///
/// # Errors
///
/// - `columns` 内に同名カラムが複数存在する場合 → `Err(name)` を返す。`name` は最初に検出した重複カラム名そのもの（未正規化）。
pub fn validate_unique_column_names(columns: &[Column]) -> Result<(), String> {
    let mut seen: HashSet<&str> = HashSet::with_capacity(columns.len());
    for column in columns {
        if !seen.insert(column.name.as_str()) {
            return Err(column.name.as_str().to_string());
        }
    }
    Ok(())
}
