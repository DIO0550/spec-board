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
//! # スコープ外（別 Issue で実装）
//! - `config.json` の書き出し（atomic write / `.bak` 退避の永続化 / 並行書き込み制御）
//! - `doneColumn` の整合性検証 / カラム名空間の正規化
//! - 実フィールド変換を伴う実マイグレーション（本モジュールはフックのみ提供）
//! - Tauri コマンド層
//!
//! 既存タスクの `(path, status)` 列から `Config` を組み立てる純粋関数
//! [`build_config_from_statuses`] は本モジュールに同居する。
//! md ファイルの走査・フロントマター抽出・`config.json` への書き出しは別レイヤの責務。

pub mod column_name;
pub mod get_columns;

use log::warn;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};

use crate::config::column_name::ColumnName;
use spec_board_fs::config::config_io::{self, write_guide_markdown, ConfigIoError};
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

    /// この設定から GUIDE.md の Markdown 本文を生成する。
    ///
    /// # Returns
    ///
    /// `.spec-board/GUIDE.md` に書き込む候補となる Markdown 文字列。末尾改行を含む。
    pub fn guide_markdown(&self) -> String {
        generate_guide_markdown(self)
    }
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

    write_backup_to_path(&dst, content, &tmp)
}

/// `backup_config_json` 内の tmp パス生成で使う process-local 連番カウンタ。
/// 同一プロセス内で並行に呼ばれても tmp パスの衝突を防ぐ。
static TMP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
use std::sync::atomic::Ordering;

/// `tmp` に `content` を書き出してから `rename(tmp, dst)` で atomic に置き換える。
///
/// [`backup_config_json`] の中核ロジック。本関数は **`tmp` パスをパラメータとして受け取る**
/// ため、テストから固定パス（例: `config.json.bak.tmp`）を渡して unlink + create_new
/// 防御を直接 exercise できる。プロダクションコードは [`backup_config_json`] が
/// `pid + nanos + counter` から派生した unique パスを渡す。
///
/// # 手順
///
/// 1. **tmp の sterilization**: `tmp` を `unlink` する（symlink / hard link なら
///    ディレクトリエントリだけ除去、リンク先 / inode は破壊しない）。
/// 2. `OpenOptions::create_new(true)` (= `O_CREAT | O_EXCL`) で fresh inode を atomic に作成。
/// 3. `write_all` で `content` を書き込み。失敗時は tmp ファイルを best-effort で削除して
///    orphan ガベージを残さない。
/// 4. `rename(tmp, dst)` で atomic 置換。失敗時も tmp を best-effort 削除。
fn write_backup_to_path(dst: &Path, content: &str, tmp: &Path) -> Result<(), LoadConfigError> {
    use std::io::Write as _;

    // ディレクトリエントリレベルで stale / 攻撃者が事前作成した tmp を除去する。
    // symlink / hard link の場合もディレクトリエントリだけを削除し、リンク先や
    // inode は破壊しない。
    match std::fs::remove_file(tmp) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(source) => {
            return Err(LoadConfigError::BackupFailed {
                path: tmp.to_path_buf(),
                source,
            });
        }
    }

    // O_CREAT | O_EXCL semantics: 直前 unlink との race で誰かが再作成していたら
    // 失敗する（攻撃者が race で再作成しても fresh inode への書き込みは確保される）。
    let mut tmp_file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(tmp)
        .map_err(|source| LoadConfigError::BackupFailed {
            path: tmp.to_path_buf(),
            source,
        })?;
    if let Err(source) = tmp_file.write_all(content.as_bytes()) {
        // write_all 失敗時に partially written な tmp が残ると、tmp 名は呼び出しごとに
        // unique なため後続 load では再利用 / cleanup されず orphan ガベージとして
        // `.spec-board/` に蓄積する。best-effort で削除する。
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(LoadConfigError::BackupFailed {
            path: tmp.to_path_buf(),
            source,
        });
    }
    // ENOSPC / EIO 等は flush / close で初めて表面化することがある。`sync_all` で
    // データ + メタデータの永続化を強制し、その失敗を明示的にエラーとして扱う
    // （`drop(tmp_file)` は close エラーを無視するため、ここで観測しないと
    // 「rename 後の `.bak` が truncate / 破損していたのに Ok(()) が返る」事象を
    // 引き起こしうる）。失敗時は `write_all` 失敗時と同様に best-effort で tmp を削除。
    if let Err(source) = tmp_file.sync_all() {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(LoadConfigError::BackupFailed {
            path: tmp.to_path_buf(),
            source,
        });
    }
    drop(tmp_file);

    std::fs::rename(tmp, dst).map_err(|source| {
        // Best-effort: rename 失敗時にも tmp を消す（次回 load 時の冪等性確保）。
        let _ = std::fs::remove_file(tmp);
        LoadConfigError::BackupFailed {
            path: dst.to_path_buf(),
            source,
        }
    })?;
    Ok(())
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

#[cfg(test)]
mod config_tests;
