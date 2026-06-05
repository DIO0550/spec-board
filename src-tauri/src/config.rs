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
//! 低レベル I/O（`.spec-board/` の作成、`config.json` の raw 読み込み / 書き出し）は
//! サブクレート `spec_board_fs::config::config_io` に集約する。本モジュールは
//! その raw 文字列を以下の経路で解釈し、薄い責務に留める:
//!
//! - 軽量スキーマ [`VersionOnly`] を `serde_json::from_str` で適用して `version` を
//!   line/col 付きで取り出す
//! - 現行 version の場合は `serde_json::from_str::<Config>` で **直接** デシリアライズ
//!   し schema mismatch のエラーも line/col を保持する
//! - 古い version の場合のみ `serde_json::Value` を materialize し、`config.json.bak`
//!   へのバックアップ → [`migrate_config`] → `serde_json::from_value::<Config>` の
//!   経路で legacy フォーマットを取り込む
//! - 未来 version は [`LoadConfigError::UnknownFutureVersion`] で停止
//! - 不在時の `Default` フォールバックと `done_column` の解決ヘルパ
//! - load 時のカラム名重複検証（[`validate_unique_column_names`]）と
//!   空 columns 拒否（[`LoadConfigError::EmptyColumns`]）
//!
//! 古い `version` のマイグレーション結果はメモリ上の [`Config`] として返り、
//! `config.json` への書き戻しは行わない（書き出し経路は別 Issue の責務）。
//!
//! # GUIDE.md 生成 / 書き込み境界
//! 本モジュールは [`Config::columns`] から GUIDE.md の Markdown 本文を組み立て、
//! `.spec-board/GUIDE.md` への best-effort 書き込み helper を提供する。
//! 更新タイミング制御と Tauri コマンド公開は command 層の責務。
//!
//! # スコープ
//! - `update_card_order` Tauri command（`cardOrder` の上書き保存）
//!
//! # スコープ外（別 Issue で実装）
//! - `.bak` 退避の永続化 / 並行書き込みの厳密な整合性制御
//! - `doneColumn` の整合性検証 / カラム名空間の正規化
//! - 実フィールド変換を伴う実マイグレーション（本モジュールはフックのみ提供）
//!
//! 既存タスクの `(path, status)` 列から `Config` を組み立てる純粋関数
//! [`build_config_from_statuses`] は本モジュールに同居する。
//! md ファイルの走査・フロントマター抽出・`config.json` への書き出しは別レイヤの責務。

pub mod clock;
pub mod column_name;
pub mod create_label;
pub mod create_milestone;
pub mod delete_label;
pub mod delete_milestone;
pub mod get_columns;
pub mod get_labels;
pub mod get_milestones;
pub mod update_card_order;
pub mod update_columns;
pub mod update_label;
pub mod update_milestone;

pub use clock::{Clock, SystemClock};

use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::{Path, PathBuf};

use crate::config::column_name::ColumnName;
use crate::config::update_columns::{ColumnRename, UpdateColumnsArgs, UpdateColumnsError};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::Task;
use spec_board_fs::config::config_io::{
    self, write_guide_markdown, ConfigIoError, SpecBoardDir, LABELS_FILE_NAME, MILESTONES_FILE_NAME,
};
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
    pub done_column: Option<ColumnName>,
}

const DEFAULT_VERSION: u32 = 1;

/// カラム（ステータス）定義。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Column {
    /// カラム名。タスクのフロントマター `status` と対応する。
    pub name: ColumnName,
    /// カラムの表示順序（0 始まり昇順を想定。連番である必要はない）。
    pub order: u32,
}

/// spec L85 の初回オープン時デフォルト / spec L223 の読み込み失敗時フォールバックで
/// 用いるベースラインカラム名。
const DEFAULT_COLUMN_NAMES: [&str; 3] = ["Todo", "In Progress", "Done"];

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
fn apply_renames_to_columns(
    columns: &[Column],
    rename_map: &HashMap<String, String>,
) -> Vec<Column> {
    columns
        .iter()
        .map(|c| match rename_map.get(c.name.as_str()) {
            Some(new_name) => Column {
                name: ColumnName::from_lenient(new_name),
                order: c.order,
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

fn format_guide_write_warning(project_root: &Path, error: &impl std::fmt::Display) -> String {
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
/// # スコープ外
/// 値配列内の重複パス除去は本関数では行わない。重複の扱いは将来別関数で検討する。
///
/// # 例
/// ```ignore
/// use std::collections::{BTreeMap, HashSet};
/// let mut map: BTreeMap<String, Vec<String>> = BTreeMap::new();
/// map.insert("Todo".into(), vec!["a.md".into(), "x.md".into()]);
/// let columns = vec![Column { name: "Todo".into(), order: 0 }];
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

/// [`migrate_config`] で発生し得るエラー。
///
/// 本Issue（骨格段階）では `from_version` が [`DEFAULT_VERSION`] を超える場合のみ報告する。
/// 将来 `DEFAULT_VERSION` を引き上げるタイミングで variant を追加する。
#[derive(Debug, PartialEq, Error)]
pub enum MigrationError {
    /// `from_version` が [`DEFAULT_VERSION`] より大きく、対応するマイグレーション経路が存在しない。
    #[error("unsupported migration from version {0}")]
    UnsupportedFromVersion(u32),
}

/// 古い `version` の `config.json` を新しい [`serde_json::Value`] に変換するフック。
///
/// # 入力前提
///
/// 入力 `value` は **`config.json` の最上位 JSON Object** を想定している。
/// [`load_or_default`] からの呼び出しではこの前提が常に満たされる
/// （非 Object 入力は [`VersionOnly`] への `serde_json::from_str` が
/// 「invalid type: \<actual\>, expected struct VersionOnly」相当の Error を返し、
/// `LoadConfigError::Parse` に倒されるため本関数には到達しない）。
///
/// # 挙動
///
/// - `from_version == DEFAULT_VERSION` のときは入力 `value` をそのまま返す（素通し）。
/// - `from_version < DEFAULT_VERSION` かつ `value` が JSON Object のときは骨格実装として
///   **他フィールドを変更せず `value["version"]` のみ [`DEFAULT_VERSION`] に書き換えて返す**。
///   これにより load 後の [`Config::version`] が一貫して [`DEFAULT_VERSION`] に正規化される。
/// - `from_version < DEFAULT_VERSION` かつ `value` が JSON Object **以外**（純粋関数として
///   単独利用された場合のみ起こり得る）のときは正規化対象が無いため `value` をそのまま返す。
///   この経路は実マイグレーション実装時に [`MigrationError`] バリアント追加で厳格化する想定。
/// - `from_version > DEFAULT_VERSION` は通常 [`load_or_default`] 側で
///   [`LoadConfigError::UnknownFutureVersion`] により早期に弾かれるが、純粋関数単独利用時の
///   防御として [`MigrationError::UnsupportedFromVersion`] を返す。
///
/// 将来 [`DEFAULT_VERSION`] を引き上げる際に `match from_version` の各アームへ実フィールド
/// 変換ロジックを追加する。
///
/// # Errors
///
/// - `from_version` が `DEFAULT_VERSION` より大きい場合 → [`MigrationError::UnsupportedFromVersion`]（純粋関数として単独呼び出しされたときの防御。通常は [`load_or_default`] 側で [`LoadConfigError::UnknownFutureVersion`] により先に弾かれる）
pub fn migrate_config(
    value: serde_json::Value,
    from_version: u32,
) -> Result<serde_json::Value, MigrationError> {
    if from_version > DEFAULT_VERSION {
        return Err(MigrationError::UnsupportedFromVersion(from_version));
    }
    if from_version == DEFAULT_VERSION {
        return Ok(value);
    }

    let mut migrated = value;
    if let serde_json::Value::Object(ref mut map) = migrated {
        map.insert(
            "version".to_string(),
            serde_json::Value::Number(serde_json::Number::from(DEFAULT_VERSION)),
        );
    }
    Ok(migrated)
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

    #[error(
        "unknown future config.json version at `{path}`: found {found}, supported up to {supported}",
        path = path.display()
    )]
    UnknownFutureVersion {
        path: PathBuf,
        found: u32,
        supported: u32,
    },

    #[error(
        "duplicate column name in config.json at `{path}`: `{name}`",
        path = path.display()
    )]
    DuplicateColumnName { path: PathBuf, name: String },

    #[error(
        "config.json at `{path}` must contain at least one column, but `columns` is empty",
        path = path.display()
    )]
    EmptyColumns { path: PathBuf },

    #[error(
        "config.json migration at `{path}` failed: {source}",
        path = path.display()
    )]
    MigrationFailed {
        path: PathBuf,
        #[source]
        source: MigrationError,
    },

    #[error("failed to write backup `{path}`: {source}", path = path.display())]
    BackupFailed {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// `<project_root>/.spec-board/config.json.bak` に `content` を書き出す。
///
/// caller が既に読み込み済みの raw 文字列 `content` をそのまま書き出すため、
/// 「config.json を読み込み → migrate → caller に Config を返す」流れの間に
/// 外部エディタが `config.json` を書き換えても、`.bak` の内容は parse に使った
/// `content` と一致することが保証される（TOCTOU 回避）。
///
/// # 書き出し戦略: sterilized tempfile + atomic rename
///
/// 1. **tmp パス名の unique 化**: `<dst>.tmp.{pid}.{nanos}.{counter}` 形式で
///    呼び出しごとに異なる名前を採用する。`counter` は process-local AtomicU64 で
///    fetch_add するため同一プロセス内 / 粗い時計分解能下でも一意性が保証され、
///    同じ project_root に対する並行 `load_or_default` 呼び出しが同一の tmp ファイルを
///    奪い合って干渉する race を回避できる（ベストエフォート — lockfile 自体は
///    本Issue 範囲外）。
/// 2. **tmp パスの sterilization**: 上記 tmp パスを一旦 `unlink` してから
///    `OpenOptions::create_new(true)`（`O_CREAT|O_EXCL` 相当）で開く。
///    これにより:
///    - 攻撃者が事前に tmp パスを symlink / hard link として作成していても、
///      `unlink` でディレクトリエントリだけを削除し（symlink 自体やリンク数のみを
///      減らし、リンク先 / inode は破壊しない）、続く `create_new` で完全に新しい
///      inode を作る。`std::fs::write` を直接使うと事前に作られた symlink を辿って
///      外部ファイルを破壊する経路があったが、本フローでは閉じる。
///    - クラッシュ等で残った stale tmp も自動的に再作成される。
/// 2. **書き出し**: 上記で開いた fresh inode に `content` を書き込む。
/// 3. **atomic `rename(<dst>.tmp, <dst>)`**: 既存 `<dst>` が hard link でも
///    symlink でも通常ファイルでも、ディレクトリエントリだけを差し替えて
///    inode は触らない。これにより既存 `<dst>` 経由での外部ファイル truncate も
///    防げる。
///
/// # symlink 防御の範囲
///
/// 書き出し前に **`<project_root>/.spec-board/` ディレクトリ** および **`config.json.bak`
/// の leaf** の双方が symlink でないことを `symlink_metadata` で確認し、いずれかが
/// symlink の場合は [`LoadConfigError::BackupFailed`] を返して書き出しを拒否する。
/// 上記の sterilized tmp + rename 戦略と併せ、symlink 経由・hard link 経由いずれの
/// 方法でも外部ファイルが上書きされないようにするベストエフォート防御。
///
/// 以下は **本関数の範囲外**であり、別Issue（lockfile / project-root 内
/// 制限）の責務とする:
/// - `<project_root>` 自身およびそれより外側 ancestor の symlink / hard link
/// - 本関数のチェックと write / rename の間に発生する TOCTOU race
///   （leaf / `.spec-board/` / `<dst>.tmp` の親方向が swap された場合）
fn backup_config_json(project_root: &Path, content: &str) -> Result<(), LoadConfigError> {
    let spec_board_dir = config_io::config_path(project_root)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_root.join(".spec-board"));

    if let Ok(meta) = std::fs::symlink_metadata(&spec_board_dir) {
        if meta.file_type().is_symlink() {
            return Err(LoadConfigError::BackupFailed {
                path: spec_board_dir,
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    ".spec-board directory is a symlink",
                ),
            });
        }
    }

    let dst = spec_board_dir.join("config.json.bak");

    if let Ok(meta) = std::fs::symlink_metadata(&dst) {
        if meta.file_type().is_symlink() {
            return Err(LoadConfigError::BackupFailed {
                path: dst,
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "backup destination is a symlink",
                ),
            });
        }
    }

    // tmp ファイル名を呼び出しごとに unique にして並行 load 時の race を回避する。
    // PID + nanos だけでは同一プロセス内 / 粗い時計分解能の環境で collision しうるため、
    // process-local AtomicU64 counter も組み合わせて in-process での一意性を担保する
    // （プロセス境界をまたぐケースは PID で分離）。lockfile による完全な並行制御は
    // 本Issue 範囲外。
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let tmp = spec_board_dir.join(format!("config.json.bak.tmp.{pid}.{nanos}.{counter}"));

    write_atomic_to_path(&dst, content, &tmp).map_err(|source| LoadConfigError::BackupFailed {
        path: dst.clone(),
        source,
    })
}

/// `backup_config_json` 内の tmp パス生成で使う process-local 連番カウンタ。
/// 同一プロセス内で並行に呼ばれても tmp パスの衝突を防ぐ。
static TMP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
use std::sync::atomic::Ordering;

/// `tmp` に `content` を書き出してから `rename(tmp, dst)` で atomic に置き換える低レベル io 関数。
///
/// 本関数は **`tmp` パスをパラメータとして受け取る**ため、テストから固定パス
/// （例: `config.json.bak.tmp`）を渡して unlink + create_new 防御を直接 exercise できる。
/// プロダクションコードは呼び出し側が `pid + nanos + counter` から派生した unique パスを渡す。
///
/// # 手順
///
/// 1. **tmp の sterilization**: `tmp` を `unlink` する（symlink / hard link なら
///    ディレクトリエントリだけ除去、リンク先 / inode は破壊しない）。
/// 2. `OpenOptions::create_new(true)` (= `O_CREAT | O_EXCL`) で fresh inode を atomic に作成。
/// 3. `write_all` で `content` を書き込み。失敗時は tmp ファイルを best-effort で削除して
///    orphan ガベージを残さない。
/// 4. `rename(tmp, dst)` で atomic 置換。失敗時も tmp を best-effort 削除。
///
/// 戻り値の `io::Result<()>` をどう詰め替えるかは呼び出し側の責務。
/// `backup_config_json` は [`LoadConfigError::BackupFailed`] に、
/// `update_columns` 経路は `UpdateColumnsError::ConfigWriteFailed` に詰める。
pub(crate) fn write_atomic_to_path(dst: &Path, content: &str, tmp: &Path) -> std::io::Result<()> {
    use std::io::Write as _;

    match std::fs::remove_file(tmp) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(source) => return Err(source),
    }

    let mut tmp_file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(tmp)?;
    if let Err(source) = tmp_file.write_all(content.as_bytes()) {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(source);
    }
    if let Err(source) = tmp_file.sync_all() {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(source);
    }
    drop(tmp_file);

    std::fs::rename(tmp, dst).inspect_err(|_| {
        let _ = std::fs::remove_file(tmp);
    })
}

/// `update_columns` などが `config.json` を atomic write するためのポート。
///
/// 本番実装は [`FsConfigWriter`]。テストでは failure injection 用の mock を実装する。
pub trait ConfigWriter {
    /// `dst` に `content` を atomic に書き出す。
    ///
    /// # Errors
    ///
    /// - 中間 tmp ファイルの作成 / 書き込み / sync / rename に失敗した場合
    ///   `std::io::Error` を返す。
    fn write_atomic(&self, dst: &Path, content: &str) -> std::io::Result<()>;
}

/// 本番実装。内部で [`write_atomic_to_path`] と [`unique_atomic_tmp_path`] を呼ぶ。
pub struct FsConfigWriter;

impl ConfigWriter for FsConfigWriter {
    fn write_atomic(&self, dst: &Path, content: &str) -> std::io::Result<()> {
        let tmp = unique_atomic_tmp_path(dst);
        write_atomic_to_path(dst, content, &tmp)
    }
}

/// `<dst>` に対して呼び出しごとに unique な tmp パスを生成する。
///
/// `update_columns` から `config.json` の atomic write を行う際にも使用するため
/// pub(crate) 公開。`backup_config_json` 内の tmp 命名規約と同じ形式
/// （`{dst}.tmp.{pid}.{nanos}.{counter}`）を共有し、
/// process-local AtomicU64 counter で in-process 一意性を担保する。
pub(crate) fn unique_atomic_tmp_path(dst: &Path) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();

    let file_name = dst
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("atomic");
    let tmp_name = format!("{file_name}.tmp.{pid}.{nanos}.{counter}");

    match dst.parent() {
        Some(parent) => parent.join(tmp_name),
        None => PathBuf::from(tmp_name),
    }
}

/// `<project_root>/.spec-board/` 配下に残っている orphan `config.json.bak.tmp.*`
/// を best-effort で削除する。
///
/// クラッシュ / 強制終了等で `backup_config_json` の `open(tmp)` と `rename(tmp, dst)`
/// の間で実行が中断された場合、unique tmp 名のため後続 load では再利用 / cleanup されず
/// `.spec-board/` に蓄積する。本関数は `load_or_default` の冒頭で呼ばれる。
///
/// # 安全条件
///
/// - **`<root>/.spec-board/` が symlink の場合は何もしない**。symlink された外部
///   ディレクトリ内の `config.json.bak.tmp.*` を巻き込み削除する経路を塞ぐ。
///   （`backup_config_json` 側でも `.spec-board/` の symlink を弾いており、本関数も
///   同等の防御をかけることで一貫性を確保）。
/// - **「閾値以上古い」 orphan のみ削除**。tmp 名末尾の `{nanos}` を読み、現在時刻との
///   差が [`STALE_TMP_THRESHOLD_NANOS`]（1 時間）を超える tmp のみが削除対象。
///   これにより同一 / 別プロセスで進行中の concurrent load が作った直後の live tmp は
///   温存され、`rename` 直前に他の load から unlink される race を回避する。
/// - 通常ファイル相当の `remove_file` を使うため symlink / hard link でもディレクトリ
///   エントリだけを除去し、リンク先 / 共有 inode は破壊しない。
///
/// I/O エラー（読み取り権限なし等）は無視する — orphan が残っても機能上の支障は
/// 発生せず、次回成功した load で再試行されるため。
const STALE_TMP_THRESHOLD_NANOS: u128 = 60 * 60 * 1_000_000_000;

fn cleanup_stale_backup_tmps(project_root: &Path) {
    let spec_board_dir = config_io::config_path(project_root)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_root.join(".spec-board"));

    // `.spec-board/` 自体が symlink なら巻き込み削除を避ける。
    if let Ok(meta) = std::fs::symlink_metadata(&spec_board_dir) {
        if meta.file_type().is_symlink() {
            return;
        }
    }

    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(u128::MAX);

    let Ok(entries) = std::fs::read_dir(&spec_board_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        let Some(rest) = name_str.strip_prefix("config.json.bak.tmp.") else {
            continue;
        };
        // 期待形式: 厳密に "{pid}.{nanos}.{counter}" の 3 整数。それ以外（無関係な
        // `config.json.bak.tmp.note.0.keep` 等）は backup tmp ではないとみなして
        // 温存する。
        let mut parts = rest.split('.');
        let (Some(pid_str), Some(nanos_str), Some(counter_str), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if pid_str.parse::<u32>().is_err() || counter_str.parse::<u64>().is_err() {
            continue;
        }
        let Ok(nanos) = nanos_str.parse::<u128>() else {
            continue;
        };
        if now_nanos.saturating_sub(nanos) < STALE_TMP_THRESHOLD_NANOS {
            // live load が進行中の可能性があるため温存。
            continue;
        }
        let _ = std::fs::remove_file(entry.path());
    }
}

/// `version` フィールドのみを抜き出す軽量スキーマ。
///
/// `serde_json::from_str` 経由で raw 文字列から直接デシリアライズすることで、
/// 欠落 / 型不一致 / `u32` 範囲外などの version 関連エラーが **元の line/column を
/// 保持した `serde_json::Error`** として返るようにする（`Value` 経由でカスタム
/// エラーを合成するアプローチでは line/col 情報が失われるため）。
///
/// `version` 以外のフィールドは無視する（`serde` のデフォルト挙動）ので、
/// 同一 raw 文字列に対する `Config` 用の本パースとは独立に version だけを
/// 取り出せる。
#[derive(Deserialize)]
struct VersionOnly {
    version: u32,
}

/// `<project_root>/.spec-board/config.json` を読み込み、[`Config`] を返す。
///
/// 1. `.spec-board/` ディレクトリを冪等に作成する
/// 2. `config.json` の存在を確認し、不在なら [`Config::default`] を返す
/// 3. [`VersionOnly`] スキーマで `version` フィールドのみを `from_str` する
///    （JSON 構文 / 必須欠落 / 型不一致 / `u32` 範囲外を line/col 付きで検出）
/// 4. `version` が [`DEFAULT_VERSION`] を超える場合は [`LoadConfigError::UnknownFutureVersion`]
/// 5. `version` が古い場合は `<root>/.spec-board/config.json.bak` を作成し
///    [`migrate_config`] を適用する
/// 6. 現行 version は `from_str::<Config>`、古い version は `from_value::<Config>` で本パース
/// 7. `columns` が空でないこと / [`validate_unique_column_names`] でカラム名重複検証
///
/// # Default を返す条件
///
/// 関数名の `_or_default` は **「`config.json` が存在しないとき」のみ** Default を
/// 返すことを意味する。読み込み I/O の失敗 / JSON パースの失敗 / 未来 version /
/// バックアップ失敗 / カラム名重複は `Err` として返却され、呼び出し層
/// （Tauri コマンド層など）が必要に応じて [`Config::default`] への
/// フォールバック判断 + 通知を行う想定
/// （仕様書「読み込み失敗 → デフォルト + トースト」は呼び出し層の責務として切り出す）。
///
/// # Errors
///
/// - `.spec-board/` の作成 / アクセスに失敗 → [`LoadConfigError::Io`]
/// - `config.json` の読み取りに失敗 → [`LoadConfigError::Io`]
/// - `config.json` のパースに失敗 → [`LoadConfigError::Parse`]
/// - `version` がサポート範囲を超える → [`LoadConfigError::UnknownFutureVersion`]
/// - `config.json.bak` の書き込みに失敗 → [`LoadConfigError::BackupFailed`]
/// - `columns` が空 → [`LoadConfigError::EmptyColumns`]
/// - カラム名重複 → [`LoadConfigError::DuplicateColumnName`]
///
/// [`LoadConfigError::MigrationFailed`] は **本Issue 時点では `load_or_default` から
/// 返されない**（`from_version > DEFAULT_VERSION` は事前に
/// [`LoadConfigError::UnknownFutureVersion`] で弾かれ、`from_version < DEFAULT_VERSION`
/// および `from_version == DEFAULT_VERSION` の経路では現行 [`migrate_config`] は常に
/// `Ok` を返すため）。バリアントは `MigrationError` の variant 追加に向けた forward
/// compatibility のために存在し、将来 [`DEFAULT_VERSION`] を引き上げて実マイグレーション
/// を実装したタイミングで実際に発生し得るようになる。
pub fn load_or_default(project_root: &Path) -> Result<Config, LoadConfigError> {
    config_io::ensure_spec_board_dir(project_root)?;
    cleanup_stale_backup_tmps(project_root);
    let raw = config_io::read_config_json(project_root)?;
    let Some(content) = raw else {
        return Ok(Config::default());
    };

    let path = config_io::config_path(project_root);

    // `VersionOnly` で raw 文字列から直接 version をデシリアライズする。
    // JSON 構文 / 必須欠落 / 型不一致 / `u32` 範囲外などのエラーは serde_json が
    // 元の line/col を持った `serde_json::Error` を返すため、hand-edited config.json
    // の version 由来エラーがそのまま位置情報付きで `LoadConfigError::Parse` に伝わる。
    let from_version = serde_json::from_str::<VersionOnly>(&content)
        .map(|v| v.version)
        .map_err(|source| LoadConfigError::Parse {
            path: path.clone(),
            source,
        })?;

    if from_version > DEFAULT_VERSION {
        return Err(LoadConfigError::UnknownFutureVersion {
            path: path.clone(),
            found: from_version,
            supported: DEFAULT_VERSION,
        });
    }

    // 現行 version の場合は `from_str::<Config>` で直接デシリアライズし、
    // schema mismatch 時に元の line/col 情報を保持する（`from_value` 経由だと位置情報が失われ、
    // hand-edited config.json の修正がしづらくなるため）。
    // 古い version の場合は `migrate_config` が `Value` を書き換える必要があるため
    // やむを得ず `from_value` を経由する（line/col 情報は失われるが、migrate 経路では
    // ユーザーが直接編集する想定が薄いため許容）。
    let config: Config = if from_version == DEFAULT_VERSION {
        serde_json::from_str(&content).map_err(|source| LoadConfigError::Parse {
            path: path.clone(),
            source,
        })?
    } else {
        let value: serde_json::Value =
            serde_json::from_str(&content).map_err(|source| LoadConfigError::Parse {
                path: path.clone(),
                source,
            })?;
        backup_config_json(project_root, &content)?;
        let migrated = migrate_config(value, from_version).map_err(|source| {
            LoadConfigError::MigrationFailed {
                path: path.clone(),
                source,
            }
        })?;
        serde_json::from_value(migrated).map_err(|source| LoadConfigError::Parse {
            path: path.clone(),
            source,
        })?
    };

    if config.columns.is_empty() {
        return Err(LoadConfigError::EmptyColumns { path: path.clone() });
    }
    validate_unique_column_names(&config.columns).map_err(|name| {
        LoadConfigError::DuplicateColumnName {
            path: path.clone(),
            name,
        }
    })?;

    Ok(config)
}

// ───────── ラベルマスタ（`.spec-board/labels.yml`） ─────────

/// `labels.yml` 全体。トップレベルは `labels:` キー配下の定義配列。
///
/// 将来 `version` 等のメタを同階層に追加しやすい構造にしてある。`labels:` キー欠落 /
/// `labels: null` / 空配列のいずれも空 `Vec`（= 全ラベル暗黙扱い）に正規化する。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelRegistry {
    /// ラベル定義の配列。lenient deserialize は Label 固有のロジックなので
    /// module free function ではなく aggregate の関連関数に紐づける。
    #[serde(default, deserialize_with = "LabelRegistry::deserialize_labels")]
    pub labels: Vec<LabelDefinition>,
}

impl LabelRegistry {
    /// `labels:` フィールドの lenient deserialize。`null`（YAML の `~` / キー単独）でも
    /// 空 `Vec` に倒す（`#[serde(default)]` だけでは `labels: null` が Vec の deserialize で
    /// 落ちるため）。Label 固有ロジックなので aggregate の関連関数として保持する。
    fn deserialize_labels<'de, D>(de: D) -> Result<Vec<LabelDefinition>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let opt = Option::<Vec<LabelDefinition>>::deserialize(de)?;
        Ok(opt.unwrap_or_default())
    }

    /// マスタ整合性を検証する。
    ///
    /// (1) `name` 空文字拒否（既存 `Label::try_from_str` 同方針、trim しない）、
    /// (2) `name` の完全一致重複検出（未正規化・完全一致一意）。定義順は保持したまま
    /// 検証のみ行う。ドメイン不変条件なので aggregate に同居させる。load / save 双方が
    /// `#[from]` で自エラーへ持ち上げる。
    fn validate(&self) -> Result<(), LabelValidationError> {
        let mut seen: HashSet<&str> = HashSet::with_capacity(self.labels.len());
        for label in &self.labels {
            if label.name.is_empty() {
                return Err(LabelValidationError::EmptyLabelName);
            }
            if !seen.insert(label.name.as_str()) {
                return Err(LabelValidationError::DuplicateLabelName {
                    name: label.name.clone(),
                });
            }
        }
        Ok(())
    }
}

/// 単一ラベルのマスタ定義。`name` のみ必須、他は任意。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelDefinition {
    /// ラベル識別子（必須）。完全一致・未正規化（trim / case 正規化なし）。
    /// 文字列以外（数値 / bool / mapping 等）は型不一致として deserialize で拒否する
    /// （lenient なのは `color` のみという契約）。
    #[serde(deserialize_with = "LabelDefinition::deserialize_string")]
    pub name: String,
    #[serde(
        default,
        deserialize_with = "LabelDefinition::deserialize_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: Option<String>,
    /// 分類グループ（任意）。`color` と同様にドメイン VO で表し、空文字は `None`
    /// （未指定）へ正規化する（生の `String` をドメイン/IPC 境界に漏らさない）。
    #[serde(
        default,
        deserialize_with = "LabelGroup::deserialize_opt",
        skip_serializing_if = "Option::is_none"
    )]
    pub group: Option<LabelGroup>,
    /// `#RRGGBB`。不正形式・型不一致（`123` / `{}` 等）は lenient に `None`（既定色）へ倒す。
    #[serde(
        default,
        deserialize_with = "LabelColor::deserialize_opt",
        skip_serializing_if = "Option::is_none"
    )]
    pub color: Option<LabelColor>,
    /// 最終更新日時（任意）。形式検証は行わず文字列のまま保持する。
    #[serde(
        default,
        deserialize_with = "LabelDefinition::deserialize_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub updated: Option<String>,
}

impl LabelDefinition {
    /// 文字列フィールド（`name`）の strict deserialize。文字列以外は型不一致エラー。
    /// `color` 以外は lenient フォールバックを設けない契約のため、数値 / bool / 構造などは
    /// `LoadLabelsError::Parse` に倒す。Label 固有ロジックなので型に紐づける。
    fn deserialize_string<'de, D>(de: D) -> Result<String, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match serde_yaml_ng::Value::deserialize(de)? {
            serde_yaml_ng::Value::String(s) => Ok(s),
            other => Err(serde::de::Error::custom(format!(
                "label field must be a string, found {}",
                yaml_value_type(&other)
            ))),
        }
    }

    /// 任意文字列フィールド（`description` / `group` / `updated`）の strict deserialize。
    /// `null` のみ `None` を許し、文字列は `Some`、それ以外の型は型不一致エラーに倒す。
    fn deserialize_opt_string<'de, D>(de: D) -> Result<Option<String>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match serde_yaml_ng::Value::deserialize(de)? {
            serde_yaml_ng::Value::Null => Ok(None),
            serde_yaml_ng::Value::String(s) => Ok(Some(s)),
            other => Err(serde::de::Error::custom(format!(
                "expected a string, found {}",
                yaml_value_type(&other)
            ))),
        }
    }
}

/// `serde_yaml_ng::Value` の種別名を返す（型不一致エラーメッセージ用）。
fn yaml_value_type(value: &serde_yaml_ng::Value) -> &'static str {
    match value {
        serde_yaml_ng::Value::Null => "null",
        serde_yaml_ng::Value::Bool(_) => "boolean",
        serde_yaml_ng::Value::Number(_) => "number",
        serde_yaml_ng::Value::String(_) => "string",
        serde_yaml_ng::Value::Sequence(_) => "sequence",
        serde_yaml_ng::Value::Mapping(_) => "mapping",
        serde_yaml_ng::Value::Tagged(_) => "tagged value",
    }
}

/// `#RRGGBB` 形式の色 VO。constructor で形式を強制する。
///
/// `Deserialize` は derive せず、フィールド側の関連関数 [`LabelColor::deserialize_opt`]
/// 経由でのみ生成する（不正値を `None` に倒すため）。
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LabelColor(String);

impl LabelColor {
    /// `#RRGGBB`（`#` + 16 進 6 桁）のみ受理する。それ以外は `None`。
    pub fn from_hex(raw: &str) -> Option<Self> {
        let is_valid = raw.len() == 7
            && raw.starts_with('#')
            && raw[1..].bytes().all(|b| b.is_ascii_hexdigit());
        is_valid.then(|| Self(raw.to_string()))
    }

    /// 保持している `#RRGGBB` 文字列を返す。
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// `color` フィールドの lenient deserialize。`serde_yaml_ng::Value` で一旦受け、
    /// 「文字列かつ `#RRGGBB` 妥当」のみ `Some(LabelColor)`、それ以外（不正文字列 /
    /// 数値 / mapping / null）は `None` に倒す。**エラーにしない**。LabelColor 固有
    /// ロジックなので関連関数として型に紐づける。
    fn deserialize_opt<'de, D>(de: D) -> Result<Option<LabelColor>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_yaml_ng::Value::deserialize(de)?;
        Ok(value.as_str().and_then(LabelColor::from_hex))
    }
}

/// ラベルの分類グループを表す値オブジェクト。
///
/// `LabelColor` と同様にドメイン型として扱い、生の `String` をドメイン / IPC 境界へ
/// 漏らさない。group には色のような形式制約はない（未正規化の自由文字列）ため、
/// 空文字のみを「未指定」(`None`) に倒す lenient 構築とする（trim / case 正規化はしない）。
/// `#[serde(transparent)]` により labels.yml 上は文字列としてそのまま round-trip する。
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct LabelGroup(String);

impl LabelGroup {
    /// 空文字は `None`（未指定）へ。それ以外はそのまま保持する。
    pub fn from_lenient(value: impl Into<String>) -> Option<Self> {
        let s = value.into();
        if s.is_empty() {
            None
        } else {
            Some(Self(s))
        }
    }

    /// 保持しているグループ名を返す。
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// `group` フィールドの lenient deserialize。`null` / 空文字は `None`、非空文字列は
    /// `Some(LabelGroup)`、それ以外の型（数値 / mapping 等）は型不一致エラーに倒す。
    /// LabelGroup 固有ロジックなので関連関数として型に紐づける。
    fn deserialize_opt<'de, D>(de: D) -> Result<Option<LabelGroup>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match serde_yaml_ng::Value::deserialize(de)? {
            serde_yaml_ng::Value::Null => Ok(None),
            serde_yaml_ng::Value::String(s) => Ok(LabelGroup::from_lenient(s)),
            other => Err(serde::de::Error::custom(format!(
                "expected a string, found {}",
                yaml_value_type(&other)
            ))),
        }
    }
}

/// ラベルマスタの整合性違反。`LabelRegistry::validate` が返すドメインエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum LabelValidationError {
    /// `name` が完全一致で重複している（未正規化・完全一致一意の契約違反）。
    #[error("duplicate label name in labels.yml: `{name}`")]
    DuplicateLabelName { name: String },
    /// `name` が空文字（`""`）。識別子として無効。空白のみ（`"   "`）は trim しない方針のため許容する。
    #[error("label name must not be empty in labels.yml")]
    EmptyLabelName,
}

/// `LabelRegistry::plan_update_label` の入力。
///
/// `name` を同一性キーとし rename を構造的に不可能にする（target と new name を
/// 分離するフィールドを持たないため）。`group` / `color` は command 側でドメイン VO
/// （`LabelGroup` / `LabelColor`）へ lenient 変換済みの値を受ける。
#[derive(Debug, Clone, PartialEq)]
pub struct UpdateLabelIntent {
    pub name: String,
    pub description: Option<String>,
    pub group: Option<LabelGroup>,
    pub color: Option<LabelColor>,
}

/// `LabelRegistry::plan_update_label` のドメインエラー。command 層がこれを wrap する。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum UpdateLabelPlanError {
    /// 更新対象 `name` が空文字。
    #[error("label name must not be empty")]
    EmptyName,
    /// 指定 `name` のラベルが存在しない。
    #[error("label not found: `{name}`")]
    NotFound { name: String },
    /// 更新後のレジストリが不変条件に違反した。
    #[error(transparent)]
    Validation(#[from] LabelValidationError),
}

/// `LabelRegistry::plan_delete_label` のドメインエラー。command 層がこれを wrap する。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DeleteLabelPlanError {
    /// 指定 `name` のラベルが存在しない。
    #[error("label not found: `{name}`")]
    NotFound { name: String },
}

impl LabelRegistry {
    /// 新ラベルを追加した新 registry を返す（副作用なし）。
    ///
    /// `updated` は `clock` の現在時刻で自動セットする。空名・完全一致重複は既存
    /// [`LabelRegistry::validate`] の再利用で拒否する。ドメイン不変条件の検証を
    /// aggregate に同居させる方針。
    pub fn plan_create_label(
        &self,
        mut definition: LabelDefinition,
        clock: &dyn Clock,
    ) -> Result<LabelRegistry, LabelValidationError> {
        definition.updated = Some(clock.now_iso8601());
        let mut next = self.clone();
        next.labels.push(definition);
        next.validate()?;
        Ok(next)
    }

    /// 既存ラベルの metadata を更新した新 registry を返す（副作用なし）。
    ///
    /// `intent.name` は同一性キーで rename しない。不在なら `NotFound`、空名なら
    /// `EmptyName`。未指定 optional はクリアする（PUT セマンティクス）。`updated` を
    /// `clock` で更新する。
    pub fn plan_update_label(
        &self,
        intent: UpdateLabelIntent,
        clock: &dyn Clock,
    ) -> Result<LabelRegistry, UpdateLabelPlanError> {
        if intent.name.is_empty() {
            return Err(UpdateLabelPlanError::EmptyName);
        }
        let mut next = self.clone();
        let slot = next
            .labels
            .iter_mut()
            .find(|l| l.name == intent.name)
            .ok_or_else(|| UpdateLabelPlanError::NotFound {
                name: intent.name.clone(),
            })?;
        // name は維持し metadata のみ差し替える（未指定 = None = クリア）。
        slot.description = intent.description;
        slot.group = intent.group;
        slot.color = intent.color;
        slot.updated = Some(clock.now_iso8601());
        next.validate()?;
        Ok(next)
    }

    /// 指定 `name` のラベルを削除した新 registry を返す（副作用なし）。不在なら `NotFound`。
    pub fn plan_delete_label(
        &self,
        target_name: &str,
    ) -> Result<LabelRegistry, DeleteLabelPlanError> {
        let exists = self.labels.iter().any(|l| l.name == target_name);
        if !exists {
            return Err(DeleteLabelPlanError::NotFound {
                name: target_name.to_string(),
            });
        }
        let mut next = self.clone();
        next.labels.retain(|l| l.name != target_name);
        Ok(next)
    }
}

/// `labels.yml` の読み込みエラー。`labels load failed (io|parse)` 方針に揃える。
#[derive(Debug, Error)]
pub enum LoadLabelsError {
    #[error(transparent)]
    Io(#[from] ConfigIoError),
    #[error("failed to parse labels.yml at `{path}`: {source}", path = path.display())]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_yaml_ng::Error,
    },
    /// マスタ整合性違反（name 空 / 重複）。load / save 双方で共有する。
    #[error(transparent)]
    Validation(#[from] LabelValidationError),
}

/// `labels.yml` の書き込みエラー（save 経路）。
#[derive(Debug, Error)]
pub enum SaveLabelsError {
    #[error(transparent)]
    Io(#[from] ConfigIoError),
    #[error("failed to serialize labels: {0}")]
    Serialize(#[source] serde_yaml_ng::Error),
    /// 不整合なマスタは保存させない（load と同じ不変条件を共有）。
    #[error(transparent)]
    Validation(#[from] LabelValidationError),
}

/// ラベルマスタの永続化を抽象化する trait（format / 配置に非依存）。
///
/// 呼び出し側（`open_project` 等）はこの trait にのみ依存し、保存形式（YAML）も
/// 具象型名も意識しない。テスト時はモック実装を注入できる。
pub trait LabelRegistryStore {
    /// マスタを読み込む。不在 / 空相当は Default（空レジストリ）。
    fn load(&self) -> Result<LabelRegistry, LoadLabelsError>;
    /// マスタを保存する（編集機能向け。本 Issue では read 経路が主だが対称性のため定義）。
    fn save(&self, registry: &LabelRegistry) -> Result<(), SaveLabelsError>;
}

/// 既定の [`LabelRegistryStore`] を生成するファクトリ。**これが唯一の入口**。
///
/// 呼び出し側は具象型を名指しせず、trait だけを受け取る。形式の差し替え（JSON 等）は
/// ここの戻り値を変えるだけで完結する。
pub fn label_registry_store(project_root: &Path) -> impl LabelRegistryStore {
    YamlLabelRegistryStore::new(project_root)
}

/// `.spec-board/labels.yml`（YAML 形式）でラベルマスタを管理する具象 store。
///
/// 形式（YAML）と配置（labels.yml）の知識をここに閉じ込める。I/O は内包する
/// [`SpecBoardDir`]（リソース管理 struct）へ委譲する。`pub(crate)`: モジュール外からは
/// [`label_registry_store`] ファクトリ + trait 経由でのみ触る。
pub(crate) struct YamlLabelRegistryStore {
    dir: SpecBoardDir,
}

impl YamlLabelRegistryStore {
    pub(crate) fn new(project_root: impl Into<PathBuf>) -> Self {
        Self {
            dir: SpecBoardDir::new(project_root),
        }
    }
}

impl LabelRegistryStore for YamlLabelRegistryStore {
    fn load(&self) -> Result<LabelRegistry, LoadLabelsError> {
        // raw String 取得は SpecBoardDir（format 非依存）、YAML パースは本 store（境界規約）。
        let Some(content) = self.dir.read_file(LABELS_FILE_NAME)? else {
            return Ok(LabelRegistry::default());
        };
        // 空白のみは Default（serde に渡すと unit/null で落ちるため先に弾く）。
        if content.trim().is_empty() {
            return Ok(LabelRegistry::default());
        }
        let path = self.dir.file_path(LABELS_FILE_NAME)?;
        // Option で受けることで、コメントのみ / `---`（null ドキュメント）も None → Default に倒す。
        let registry = serde_yaml_ng::from_str::<Option<LabelRegistry>>(&content)
            .map_err(|source| LoadLabelsError::Parse { path, source })?
            .unwrap_or_default();
        registry.validate()?;
        Ok(registry)
    }

    fn save(&self, registry: &LabelRegistry) -> Result<(), SaveLabelsError> {
        registry.validate()?;
        let content = serde_yaml_ng::to_string(registry).map_err(SaveLabelsError::Serialize)?;
        self.dir.write_file(LABELS_FILE_NAME, &content)?;
        Ok(())
    }
}

// ───────────────────────── マイルストーンマスタ ─────────────────────────
//
// labels.yml の `LabelRegistry` 系を雛形に、frontmatter `milestone`（単数の自由
// 文字列）に対するマスタ定義（表示名・期日・並び順・状態）を管理する。labels と
// 同じハイブリッド構成（frontmatter 自由文字列 + yml マスタ・非破壊・暗黙許容）。

/// マイルストーンマスタの集約ルート。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneRegistry {
    /// マイルストーン定義の配列。`milestones: null` / 欠落 / 空配列はいずれも空 Vec へ。
    #[serde(
        default,
        deserialize_with = "MilestoneRegistry::deserialize_milestones"
    )]
    pub milestones: Vec<MilestoneDefinition>,
}

impl MilestoneRegistry {
    /// `milestones:` フィールドの lenient deserialize（`null` でも空 Vec に倒す）。
    fn deserialize_milestones<'de, D>(de: D) -> Result<Vec<MilestoneDefinition>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let opt = Option::<Vec<MilestoneDefinition>>::deserialize(de)?;
        Ok(opt.unwrap_or_default())
    }

    /// マスタ整合性を検証する。`name` 空拒否（trim しない）+ 完全一致重複検出。
    fn validate(&self) -> Result<(), MilestoneValidationError> {
        let mut seen: HashSet<&str> = HashSet::with_capacity(self.milestones.len());
        for milestone in &self.milestones {
            if milestone.name.is_empty() {
                return Err(MilestoneValidationError::EmptyMilestoneName);
            }
            if !seen.insert(milestone.name.as_str()) {
                return Err(MilestoneValidationError::DuplicateMilestoneName {
                    name: milestone.name.clone(),
                });
            }
        }
        Ok(())
    }

    /// 新マイルストーンを追加した新 registry を返す（副作用なし）。`updated` は `clock`
    /// で自動セット。空名・完全一致重複は [`MilestoneRegistry::validate`] で拒否する。
    pub fn plan_create_milestone(
        &self,
        mut definition: MilestoneDefinition,
        clock: &dyn Clock,
    ) -> Result<MilestoneRegistry, MilestoneValidationError> {
        definition.updated = Some(clock.now_iso8601());
        let mut next = self.clone();
        next.milestones.push(definition);
        next.validate()?;
        Ok(next)
    }

    /// 既存マイルストーンの metadata を更新した新 registry を返す（副作用なし）。
    ///
    /// `intent.name` は同一性キーで rename しない。不在なら `NotFound`、空名なら
    /// `EmptyName`。未指定 optional はクリアする（PUT セマンティクス）。`updated` を
    /// `clock` で更新する。
    pub fn plan_update_milestone(
        &self,
        intent: UpdateMilestoneIntent,
        clock: &dyn Clock,
    ) -> Result<MilestoneRegistry, UpdateMilestonePlanError> {
        if intent.name.is_empty() {
            return Err(UpdateMilestonePlanError::EmptyName);
        }
        let mut next = self.clone();
        let slot = next
            .milestones
            .iter_mut()
            .find(|m| m.name == intent.name)
            .ok_or_else(|| UpdateMilestonePlanError::NotFound {
                name: intent.name.clone(),
            })?;
        // name は維持し metadata のみ差し替える（未指定 = None = クリア）。
        slot.title = intent.title;
        slot.description = intent.description;
        slot.due = intent.due;
        slot.order = intent.order;
        slot.state = intent.state;
        slot.updated = Some(clock.now_iso8601());
        next.validate()?;
        Ok(next)
    }

    /// 指定 `name` のマイルストーンを削除した新 registry を返す（副作用なし）。不在なら
    /// `NotFound`。frontmatter の `milestone` 値には一切干渉しない（非破壊）。
    pub fn plan_delete_milestone(
        &self,
        target_name: &str,
    ) -> Result<MilestoneRegistry, DeleteMilestonePlanError> {
        let exists = self.milestones.iter().any(|m| m.name == target_name);
        if !exists {
            return Err(DeleteMilestonePlanError::NotFound {
                name: target_name.to_string(),
            });
        }
        let mut next = self.clone();
        next.milestones.retain(|m| m.name != target_name);
        Ok(next)
    }
}

/// 単一マイルストーンのマスタ定義。`name` のみ必須、他は任意。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneDefinition {
    /// マイルストーン識別子（必須）。完全一致・未正規化。文字列以外は型不一致エラー。
    #[serde(deserialize_with = "MilestoneDefinition::deserialize_string")]
    pub name: String,
    /// 人間可読な表示名（任意）。空文字は `None`（未指定）へ正規化する。
    #[serde(
        default,
        deserialize_with = "MilestoneDefinition::deserialize_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub title: Option<String>,
    /// 説明文（任意）。空文字は `None` へ正規化する。
    #[serde(
        default,
        deserialize_with = "MilestoneDefinition::deserialize_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub description: Option<String>,
    /// 期日（任意）。形式検証は行わず文字列のまま保持する。空文字は `None` へ。
    #[serde(
        default,
        deserialize_with = "MilestoneDefinition::deserialize_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub due: Option<String>,
    /// 並び順（任意）。有限の非負整数のみ有効。小数 / 負数 / null / 型不一致は `None`
    /// （型 lenient）。
    #[serde(
        default,
        deserialize_with = "MilestoneDefinition::deserialize_opt_order",
        skip_serializing_if = "Option::is_none"
    )]
    pub order: Option<u32>,
    /// 開閉状態（任意）。文字列型は strict だが未知の文字列値も `Other` で保持する
    /// （値 lenient）。空文字は `None`（未指定）へ。
    #[serde(
        default,
        deserialize_with = "MilestoneState::deserialize_opt",
        skip_serializing_if = "Option::is_none"
    )]
    pub state: Option<MilestoneState>,
    /// 最終更新日時（任意）。形式検証は行わず文字列のまま保持する。空文字は `None`。
    #[serde(
        default,
        deserialize_with = "MilestoneDefinition::deserialize_opt_string",
        skip_serializing_if = "Option::is_none"
    )]
    pub updated: Option<String>,
}

impl MilestoneDefinition {
    /// 文字列フィールド（`name`）の strict deserialize。文字列以外は型不一致エラー。
    fn deserialize_string<'de, D>(de: D) -> Result<String, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match serde_yaml_ng::Value::deserialize(de)? {
            serde_yaml_ng::Value::String(s) => Ok(s),
            other => Err(serde::de::Error::custom(format!(
                "milestones[].name must be a string, found {}",
                yaml_value_type(&other)
            ))),
        }
    }

    /// 任意文字列フィールド（`title` / `description` / `due` / `updated`）の deserialize。
    ///
    /// labels の `deserialize_opt_string` が空文字を `Some("")` で保持するのと異なり、
    /// milestone は空文字を `None`（未指定）へ正規化する（019 スキーマ準拠）。`null` も
    /// `None`、文字列以外の型は型不一致エラーに倒す。
    fn deserialize_opt_string<'de, D>(de: D) -> Result<Option<String>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match serde_yaml_ng::Value::deserialize(de)? {
            serde_yaml_ng::Value::Null => Ok(None),
            serde_yaml_ng::Value::String(s) => {
                if s.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(s))
                }
            }
            other => Err(serde::de::Error::custom(format!(
                "expected a string, found {}",
                yaml_value_type(&other)
            ))),
        }
    }

    /// `order` フィールドの型 lenient deserialize。有限の非負整数で `u32` に収まる値のみ
    /// `Some`、それ以外（小数 / 負数 / 範囲外 / 文字列 / null / 型不一致）は `None`。
    fn deserialize_opt_order<'de, D>(de: D) -> Result<Option<u32>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_yaml_ng::Value::deserialize(de)?;
        let parsed = match value {
            serde_yaml_ng::Value::Number(n) => n.as_u64().and_then(|v| u32::try_from(v).ok()),
            _ => None,
        };
        Ok(parsed)
    }
}

/// マイルストーンの開閉状態を表す値オブジェクト。
///
/// `open` / `closed` は既知バリアント、未知の文字列値は `Other` で保持する（値 lenient・
/// 前方互換）。`LabelColor` / `LabelGroup` の VO パターンに倣い `Deserialize` は derive
/// せず、フィールド側の関連関数 [`MilestoneState::deserialize_opt`] 経由で生成する。
/// `Serialize` は `as_str` を文字列として出力する。
#[derive(Debug, Clone, PartialEq)]
pub enum MilestoneState {
    Open,
    Closed,
    /// 未知の文字列値（`open` / `closed` 以外）。前方互換のため保持する。
    Other(String),
}

impl MilestoneState {
    /// 保持している状態文字列を返す。
    pub fn as_str(&self) -> &str {
        match self {
            MilestoneState::Open => "open",
            MilestoneState::Closed => "closed",
            MilestoneState::Other(s) => s.as_str(),
        }
    }

    /// 文字列を値 lenient で `MilestoneState` へ変換する（未知値も `Other` で保持）。
    /// CRUD コマンドの `Option<String>` Args から `.map(...)` で合成して使う。
    pub fn from_lenient(raw: impl Into<String>) -> MilestoneState {
        let s = raw.into();
        match s.as_str() {
            "open" => MilestoneState::Open,
            "closed" => MilestoneState::Closed,
            _ => MilestoneState::Other(s),
        }
    }

    /// `state` フィールドの deserialize。文字列型のみ受理し、値は値 lenient（未知も
    /// `Other` 保持）。空文字 / `null` は `None`（未指定）。文字列以外の型（数値 / bool /
    /// mapping 等）は型不一致エラーに倒す（型は strict）。
    fn deserialize_opt<'de, D>(de: D) -> Result<Option<MilestoneState>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        match serde_yaml_ng::Value::deserialize(de)? {
            serde_yaml_ng::Value::Null => Ok(None),
            serde_yaml_ng::Value::String(s) => {
                if s.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(MilestoneState::from_lenient(s)))
                }
            }
            other => Err(serde::de::Error::custom(format!(
                "expected a string, found {}",
                yaml_value_type(&other)
            ))),
        }
    }
}

impl serde::Serialize for MilestoneState {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

/// マイルストーンマスタの整合性違反。`MilestoneRegistry::validate` が返すドメインエラー。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum MilestoneValidationError {
    /// `name` が完全一致で重複している。
    #[error("duplicate milestone name in milestones.yml: `{name}`")]
    DuplicateMilestoneName { name: String },
    /// `name` が空文字（`""`）。識別子として無効。空白のみ（`"   "`）は許容する。
    #[error("milestone name must not be empty in milestones.yml")]
    EmptyMilestoneName,
}

/// `MilestoneRegistry::plan_update_milestone` の入力。
///
/// `name` を同一性キーとし rename を構造的に不可能にする。`state` は command 側で
/// `MilestoneState::from_lenient` 変換済みの値を受ける。
#[derive(Debug, Clone, PartialEq)]
pub struct UpdateMilestoneIntent {
    pub name: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub due: Option<String>,
    pub order: Option<u32>,
    pub state: Option<MilestoneState>,
}

/// `MilestoneRegistry::plan_update_milestone` のドメインエラー。command 層が wrap する。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum UpdateMilestonePlanError {
    /// 更新対象 `name` が空文字。
    #[error("milestone name must not be empty")]
    EmptyName,
    /// 指定 `name` のマイルストーンが存在しない。
    #[error("milestone not found: `{name}`")]
    NotFound { name: String },
    /// 更新後のレジストリが不変条件に違反した。
    #[error(transparent)]
    Validation(#[from] MilestoneValidationError),
}

/// `MilestoneRegistry::plan_delete_milestone` のドメインエラー。command 層が wrap する。
#[derive(Debug, Error, PartialEq, Eq)]
pub enum DeleteMilestonePlanError {
    /// 指定 `name` のマイルストーンが存在しない。
    #[error("milestone not found: `{name}`")]
    NotFound { name: String },
}

/// `milestones.yml` の読み込みエラー。`milestones load failed (io|parse)` 方針に揃える。
#[derive(Debug, Error)]
pub enum LoadMilestonesError {
    #[error(transparent)]
    Io(#[from] ConfigIoError),
    #[error("failed to parse milestones.yml at `{path}`: {source}", path = path.display())]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_yaml_ng::Error,
    },
    /// マスタ整合性違反（name 空 / 重複）。
    #[error(transparent)]
    Validation(#[from] MilestoneValidationError),
}

/// `milestones.yml` の書き込みエラー（save 経路）。
#[derive(Debug, Error)]
pub enum SaveMilestonesError {
    #[error(transparent)]
    Io(#[from] ConfigIoError),
    #[error("failed to serialize milestones: {0}")]
    Serialize(#[source] serde_yaml_ng::Error),
    /// 不整合なマスタは保存させない。
    #[error(transparent)]
    Validation(#[from] MilestoneValidationError),
}

/// マイルストーンマスタの永続化を抽象化する trait（format / 配置に非依存）。
pub trait MilestoneRegistryStore {
    /// マスタを読み込む。不在 / 空相当は Default（空レジストリ）。
    fn load(&self) -> Result<MilestoneRegistry, LoadMilestonesError>;
    /// マスタを保存する。
    fn save(&self, registry: &MilestoneRegistry) -> Result<(), SaveMilestonesError>;
}

/// 既定の [`MilestoneRegistryStore`] を生成するファクトリ。**これが唯一の入口**。
pub fn milestone_registry_store(project_root: &Path) -> impl MilestoneRegistryStore {
    YamlMilestoneRegistryStore::new(project_root)
}

/// `.spec-board/milestones.yml`（YAML 形式）でマスタを管理する具象 store。
pub(crate) struct YamlMilestoneRegistryStore {
    dir: SpecBoardDir,
}

impl YamlMilestoneRegistryStore {
    pub(crate) fn new(project_root: impl Into<PathBuf>) -> Self {
        Self {
            dir: SpecBoardDir::new(project_root),
        }
    }
}

impl MilestoneRegistryStore for YamlMilestoneRegistryStore {
    fn load(&self) -> Result<MilestoneRegistry, LoadMilestonesError> {
        let Some(content) = self.dir.read_file(MILESTONES_FILE_NAME)? else {
            return Ok(MilestoneRegistry::default());
        };
        if content.trim().is_empty() {
            return Ok(MilestoneRegistry::default());
        }
        let path = self.dir.file_path(MILESTONES_FILE_NAME)?;
        let registry = serde_yaml_ng::from_str::<Option<MilestoneRegistry>>(&content)
            .map_err(|source| LoadMilestonesError::Parse { path, source })?
            .unwrap_or_default();
        registry.validate()?;
        Ok(registry)
    }

    fn save(&self, registry: &MilestoneRegistry) -> Result<(), SaveMilestonesError> {
        registry.validate()?;
        let content = serde_yaml_ng::to_string(registry).map_err(SaveMilestonesError::Serialize)?;
        self.dir.write_file(MILESTONES_FILE_NAME, &content)?;
        Ok(())
    }
}

#[cfg(test)]
mod config_tests;

#[cfg(test)]
mod label_registry_tests;

#[cfg(test)]
mod milestone_registry_tests;
