//! プロジェクト設定ドメインの親モジュール。
//!
//! 子フォルダ `config/` 配下の各モジュールへ `pub mod` で委譲し、公開 API は
//! `pub use` で再エクスポートする。本ファイル自体にロジックは持たない
//! （モジュール記法: 子フォルダを持つドメイン親ファイルは「`pub mod` 列挙 + `pub use`」のみ）。
//!
//! # 子モジュールの責務
//! - [`core`] — `Config` / `Column` / `ColumnColor` などコアスキーマ型と、
//!   GUIDE.md 生成・`update_columns` 純粋計算・`build_config_from_statuses` 等のドメインロジック
//! - [`card_order`] — `cardOrder` の newtype `CardOrder`（canonical パス + 同一カラム内一意）
//! - [`migration`] — `config.json` の `version` マイグレーションフック
//! - [`load`] — `.spec-board/config.json` の読み込みと低レベル atomic write インフラ
//! - [`label_registry`] — ラベルマスタ（`labels.yml`）のドメイン型・aggregate・永続化
//! - [`milestone_registry`] — マイルストーンマスタ（`milestones.yml`）のドメイン型・aggregate・永続化
//! - その他（`column_name` / `clock` / `get_*` / `create_*` / `update_*` / `delete_*`）は
//!   VO・時計・Tauri command 各モジュール

pub mod card_order;
pub mod clock;
pub mod column_name;
pub mod config_files;
pub mod core;
pub mod create_label;
pub mod create_milestone;
pub mod delete_label;
pub mod delete_milestone;
pub mod export_labels;
pub mod get_columns;
pub mod get_labels;
pub mod get_milestones;
pub mod label_registry;
pub mod load;
pub mod migration;
pub mod milestone_registry;
pub mod update_columns;
pub mod update_label;
pub mod update_milestone;

pub use clock::{Clock, SystemClock};

pub use card_order::CardOrder;
pub use core::{
    build_config_from_statuses, generate_guide_markdown, generate_guide_markdown_for_columns,
    validate_unique_column_names, write_guide_markdown_best_effort, Column, ColumnColor, Config,
    ReconcileColumnsPlan, RenameTarget, UpdateCardOrderPlanError, UpdateColumnsPlan,
};
pub use load::{load_or_default, load_persisted, ConfigWriter, FsConfigWriter, LoadConfigError};
pub use migration::{migrate_config, MigrationError};

pub use label_registry::{
    label_registry_store, DeleteLabelPlanError, LabelColor, LabelDefinition, LabelGroup,
    LabelRegistry, LabelRegistryStore, LabelValidationError, LoadLabelsError, SaveLabelsError,
    UpdateLabelIntent, UpdateLabelPlanError,
};
pub use milestone_registry::{
    milestone_registry_store, DeleteMilestonePlanError, LoadMilestonesError, MilestoneDefinition,
    MilestoneRegistry, MilestoneRegistryStore, MilestoneState, MilestoneValidationError,
    SaveMilestonesError, UpdateMilestoneIntent, UpdateMilestonePlanError,
};

// テスト（`config_tests` / `label_registry_tests` / `milestone_registry_tests`）は
// 本親モジュールの子として `super::*` 経由でコア型・crate 内部 helper・標準 import を
// 解決するため、それらをモジュールスコープへ取り込む。
#[cfg(test)]
use core::{apply_renames_to_columns, format_guide_write_warning, DEFAULT_VERSION};
#[cfg(test)]
use load::write_atomic_to_path;
#[cfg(test)]
use std::collections::{BTreeMap, HashMap, HashSet};
#[cfg(test)]
use std::path::PathBuf;

#[cfg(test)]
pub(crate) mod label_name_fixture;

#[cfg(test)]
mod config_tests;

#[cfg(test)]
mod label_registry_tests;

#[cfg(test)]
mod milestone_registry_tests;
