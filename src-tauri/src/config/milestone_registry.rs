//! マイルストーンマスタ（`.spec-board/milestones.yml`）のドメイン型・aggregate・永続化。
//!
//! labels.yml の `LabelRegistry` 系を雛形に、frontmatter `milestone`（単数の自由
//! 文字列）に対するマスタ定義（表示名・期日・並び順・状態）を管理する。labels と
//! 同じハイブリッド構成（frontmatter 自由文字列 + yml マスタ・非破壊・暗黙許容）。

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use spec_board_fs::config::config_io::{ConfigIoError, SpecBoardDir, MILESTONES_FILE_NAME};
use thiserror::Error;

use crate::config::clock::Clock;

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

/// マイルストーンマスタの集約ルート。
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneRegistry {
    /// 検証済み定義。wire / disk 上では従来どおり `milestones` 配列として出力する。
    #[serde(rename = "milestones")]
    definitions: Vec<MilestoneDefinition>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawMilestoneRegistry {
    #[serde(
        default,
        deserialize_with = "MilestoneRegistry::deserialize_milestones"
    )]
    milestones: Vec<MilestoneDefinition>,
}

impl MilestoneRegistry {
    /// マイルストーン定義を検証して registry を構築する。
    ///
    /// 空文字の名前と完全一致する重複名を拒否し、空白・大文字小文字・定義順は
    /// 正規化せず保持する。
    pub fn try_new(
        definitions: Vec<MilestoneDefinition>,
    ) -> Result<Self, MilestoneValidationError> {
        let registry = Self { definitions };
        registry.validate()?;
        Ok(registry)
    }

    /// 保持しているマイルストーン定義を定義順のまま返す。
    pub fn definitions(&self) -> &[MilestoneDefinition] {
        &self.definitions
    }

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
        let mut seen: HashSet<&str> = HashSet::with_capacity(self.definitions.len());
        for milestone in &self.definitions {
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
        let mut definitions = self.definitions.clone();
        definitions.push(definition);
        Self::try_new(definitions)
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
            .definitions
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
        Ok(Self::try_new(next.definitions)?)
    }

    /// 指定 `name` のマイルストーンを削除した新 registry を返す（副作用なし）。不在なら
    /// `NotFound`。frontmatter の `milestone` 値には一切干渉しない（非破壊）。
    pub fn plan_delete_milestone(
        &self,
        target_name: &str,
    ) -> Result<MilestoneRegistry, DeleteMilestonePlanError> {
        let exists = self.definitions.iter().any(|m| m.name == target_name);
        if !exists {
            return Err(DeleteMilestonePlanError::NotFound {
                name: target_name.to_string(),
            });
        }
        let mut next = self.clone();
        next.definitions.retain(|m| m.name != target_name);
        Ok(next)
    }
}

impl<'de> Deserialize<'de> for MilestoneRegistry {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = RawMilestoneRegistry::deserialize(deserializer)?;
        Self::try_new(raw.milestones).map_err(serde::de::Error::custom)
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
        let raw = serde_yaml_ng::from_str::<Option<RawMilestoneRegistry>>(&content)
            .map_err(|source| LoadMilestonesError::Parse { path, source })?
            .unwrap_or_default();
        Ok(MilestoneRegistry::try_new(raw.milestones)?)
    }

    fn save(&self, registry: &MilestoneRegistry) -> Result<(), SaveMilestonesError> {
        registry.validate()?;
        let content = serde_yaml_ng::to_string(registry).map_err(SaveMilestonesError::Serialize)?;
        self.dir.write_file(MILESTONES_FILE_NAME, &content)?;
        Ok(())
    }
}
