//! ラベルマスタ（`.spec-board/labels.yml`）のドメイン型・aggregate・永続化。
//!
//! トップレベル集約 [`LabelRegistry`] と定義 [`LabelDefinition`]、VO（[`LabelColor`] /
//! [`LabelGroup`]）、aggregate の `plan_*`（副作用なし）、不変条件検証、
//! `labels.yml`（YAML）への永続化 store（[`label_registry_store`] ファクトリ +
//! [`LabelRegistryStore`] trait）を提供する。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use spec_board_fs::config::config_io::{ConfigIoError, SpecBoardDir, LABELS_FILE_NAME};
use thiserror::Error;

use crate::config::clock::Clock;

/// `labels.yml` 全体。トップレベルは `labels:` キー配下の定義配列。
///
/// 将来 `version` 等のメタを同階層に追加しやすい構造にしてある。`labels:` キー欠落 /
/// `labels: null` / 空配列のいずれも空 `Vec`（= 全ラベル暗黙扱い）に正規化する。
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelRegistry {
    /// 検証済みラベル定義。wire / disk 上では従来どおり `labels` 配列として出力する。
    #[serde(rename = "labels")]
    definitions: Vec<LabelDefinition>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawLabelRegistry {
    #[serde(default, deserialize_with = "LabelRegistry::deserialize_labels")]
    labels: Vec<LabelDefinition>,
}

impl LabelRegistry {
    /// ラベル定義を検証して registry を構築する。
    ///
    /// 空文字の名前と完全一致する重複名を拒否し、空白・大文字小文字・定義順は
    /// 正規化せず保持する。
    pub fn try_new(definitions: Vec<LabelDefinition>) -> Result<Self, LabelValidationError> {
        let registry = Self { definitions };
        registry.validate()?;
        Ok(registry)
    }

    /// 保持しているラベル定義を定義順のまま返す。
    pub fn definitions(&self) -> &[LabelDefinition] {
        &self.definitions
    }

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
        let mut seen: HashSet<&str> = HashSet::with_capacity(self.definitions.len());
        for label in &self.definitions {
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
        let mut definitions = self.definitions.clone();
        definitions.push(definition);
        Self::try_new(definitions)
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
            .definitions
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
        Ok(Self::try_new(next.definitions)?)
    }

    /// 指定 `name` のラベルを削除した新 registry を返す（副作用なし）。不在なら `NotFound`。
    pub fn plan_delete_label(
        &self,
        target_name: &str,
    ) -> Result<LabelRegistry, DeleteLabelPlanError> {
        let exists = self.definitions.iter().any(|l| l.name == target_name);
        if !exists {
            return Err(DeleteLabelPlanError::NotFound {
                name: target_name.to_string(),
            });
        }
        let mut next = self.clone();
        next.definitions.retain(|l| l.name != target_name);
        Ok(next)
    }
}

impl<'de> Deserialize<'de> for LabelRegistry {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = RawLabelRegistry::deserialize(deserializer)?;
        Self::try_new(raw.labels).map_err(serde::de::Error::custom)
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
    /// マスタを保存する（ラベル編集機能で使用する書き込み経路）。
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
        let raw = serde_yaml_ng::from_str::<Option<RawLabelRegistry>>(&content)
            .map_err(|source| LoadLabelsError::Parse { path, source })?
            .unwrap_or_default();
        Ok(LabelRegistry::try_new(raw.labels)?)
    }

    fn save(&self, registry: &LabelRegistry) -> Result<(), SaveLabelsError> {
        registry.validate()?;
        let content = serde_yaml_ng::to_string(registry).map_err(SaveLabelsError::Serialize)?;
        self.dir.write_file(LABELS_FILE_NAME, &content)?;
        Ok(())
    }
}
