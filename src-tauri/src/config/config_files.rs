//! 設定ファイル viewer 用 Tauri command。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use spec_board_fs::config::config_io::{ConfigIoError, SpecBoardDir};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;
use thiserror::Error;

use crate::state::{AppState, AppStateError};

const CONFIG_FILE_NAME: &str = "config.json";
const GUIDE_FILE_NAME: &str = "GUIDE.md";
const LABELS_FILE_NAME: &str = "labels.yml";

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfigFileTarget {
    Config,
    Guide,
}

impl ConfigFileTarget {
    const fn file_name(self) -> &'static str {
        match self {
            Self::Config => CONFIG_FILE_NAME,
            Self::Guide => GUIDE_FILE_NAME,
        }
    }

    const fn language(self) -> &'static str {
        match self {
            Self::Config => "JSON",
            Self::Guide => "Markdown",
        }
    }

    const fn generated(self) -> bool {
        matches!(self, Self::Guide)
    }
}

impl TryFrom<&str> for ConfigFileTarget {
    type Error = ConfigFileCommandError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "config" => Ok(Self::Config),
            "guide" => Ok(Self::Guide),
            value => Err(ConfigFileCommandError::InvalidTarget(value.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenConfigFileTarget {
    Config,
    Guide,
    Labels,
}

impl OpenConfigFileTarget {
    const fn file_name(self) -> &'static str {
        match self {
            Self::Config => CONFIG_FILE_NAME,
            Self::Guide => GUIDE_FILE_NAME,
            Self::Labels => LABELS_FILE_NAME,
        }
    }
}

impl TryFrom<&str> for OpenConfigFileTarget {
    type Error = ConfigFileCommandError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "config" => Ok(Self::Config),
            "guide" => Ok(Self::Guide),
            "labels" => Ok(Self::Labels),
            value => Err(ConfigFileCommandError::InvalidTarget(value.to_string())),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFilePayload {
    pub id: ConfigFileTarget,
    pub name: String,
    pub path: String,
    pub badge: String,
    pub language: String,
    pub content: String,
    pub generated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetConfigFilesPayload {
    pub files: Vec<ConfigFilePayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenConfigFileArgs {
    pub target: String,
}

#[derive(Debug, Error)]
pub enum ConfigFileCommandError {
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,
    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,
    #[error("設定ファイルの対象が不正です: {0}")]
    InvalidTarget(String),
    #[error("設定ファイルが見つかりません: {0:?}")]
    MissingFile(ConfigFileTarget),
    #[error("symlink は設定ファイル境界として使用できません: {path}", path = path.display())]
    SymlinkBoundary { path: PathBuf },
    #[error("設定ファイル境界を検証できません: {path}: {source}", path = path.display())]
    BoundaryMetadata {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("設定ファイルのパスがプロジェクト外を指しています: {path}", path = path.display())]
    OutsideProjectBoundary { path: PathBuf },
    #[error(transparent)]
    Io(#[from] ConfigIoError),
    #[error("設定ファイルを開けませんでした: {0}")]
    Open(String),
}

impl From<AppStateError> for ConfigFileCommandError {
    fn from(_: AppStateError) -> Self {
        Self::StateLockPoisoned
    }
}

fn payload(target: ConfigFileTarget, content: String) -> ConfigFilePayload {
    let name = target.file_name();
    ConfigFilePayload {
        id: target,
        name: name.to_string(),
        path: format!(".spec-board/{name}"),
        badge: if target.generated() {
            "自動生成".to_string()
        } else {
            format!("{:.1} KB", content.len() as f64 / 1024.0)
        },
        language: target.language().to_string(),
        content,
        generated: target.generated(),
    }
}

fn snapshot(
    state: &AppState,
) -> Result<crate::project_session::ProjectSessionSnapshot, ConfigFileCommandError> {
    state
        .session_snapshot()?
        .ok_or(ConfigFileCommandError::NoProjectOpen)
}

fn symlink_metadata_if_exists(
    path: &Path,
) -> Result<Option<std::fs::Metadata>, ConfigFileCommandError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) => Err(ConfigFileCommandError::BoundaryMetadata {
            path: path.to_path_buf(),
            source,
        }),
    }
}

fn canonicalize_boundary(path: &Path) -> Result<PathBuf, ConfigFileCommandError> {
    std::fs::canonicalize(path).map_err(|source| ConfigFileCommandError::BoundaryMetadata {
        path: path.to_path_buf(),
        source,
    })
}

fn validate_spec_board_directory(
    root: &Path,
    directory: &Path,
) -> Result<(), ConfigFileCommandError> {
    let Some(metadata) = symlink_metadata_if_exists(directory)? else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        return Err(ConfigFileCommandError::SymlinkBoundary {
            path: directory.to_path_buf(),
        });
    }

    let canonical_root = canonicalize_boundary(root)?;
    let canonical_directory = canonicalize_boundary(directory)?;
    if canonical_directory != canonical_root.join(".spec-board") {
        return Err(ConfigFileCommandError::OutsideProjectBoundary {
            path: directory.to_path_buf(),
        });
    }
    Ok(())
}

fn validate_config_file_boundary(root: &Path, path: &Path) -> Result<(), ConfigFileCommandError> {
    let directory = path
        .parent()
        .expect("config file path always has .spec-board parent");
    validate_spec_board_directory(root, directory)?;

    let Some(metadata) = symlink_metadata_if_exists(path)? else {
        return Ok(());
    };
    if metadata.file_type().is_symlink() {
        return Err(ConfigFileCommandError::SymlinkBoundary {
            path: path.to_path_buf(),
        });
    }

    let canonical_path = canonicalize_boundary(path)?;
    let canonical_directory = canonicalize_boundary(directory)?;
    if canonical_path.parent() != Some(canonical_directory.as_path()) {
        return Err(ConfigFileCommandError::OutsideProjectBoundary {
            path: path.to_path_buf(),
        });
    }
    Ok(())
}

fn resolve_named_config_file_path(
    root: &Path,
    file_name: &str,
) -> Result<PathBuf, ConfigFileCommandError> {
    let path = SpecBoardDir::new(root).file_path(file_name)?;
    validate_config_file_boundary(root, &path)?;
    Ok(path)
}

pub(crate) fn resolve_config_file_path(
    root: &Path,
    target: OpenConfigFileTarget,
) -> Result<PathBuf, ConfigFileCommandError> {
    resolve_named_config_file_path(root, target.file_name())
}

pub(crate) fn resolve_config_folder_path(root: &Path) -> Result<PathBuf, ConfigFileCommandError> {
    let dir = SpecBoardDir::new(root);
    let config_path = dir.file_path(CONFIG_FILE_NAME)?;
    let directory = config_path
        .parent()
        .expect("config path always has .spec-board parent")
        .to_path_buf();
    validate_spec_board_directory(root, &directory)?;
    Ok(directory)
}

pub(crate) fn get_config_files_impl(
    state: &AppState,
) -> Result<GetConfigFilesPayload, ConfigFileCommandError> {
    let snapshot = snapshot(state)?;
    let root = snapshot.project_root().as_path();
    let dir = SpecBoardDir::new(root);
    let files = [ConfigFileTarget::Config, ConfigFileTarget::Guide]
        .into_iter()
        .map(|target| {
            resolve_named_config_file_path(root, target.file_name())?;
            let content = dir
                .read_file(target.file_name())?
                .ok_or(ConfigFileCommandError::MissingFile(target))?;
            Ok(payload(target, content))
        })
        .collect::<Result<Vec<_>, ConfigFileCommandError>>()?;
    Ok(GetConfigFilesPayload { files })
}

pub(crate) fn regenerate_guide_impl(
    state: &AppState,
) -> Result<ConfigFilePayload, ConfigFileCommandError> {
    let snapshot = snapshot(state)?;
    let content = snapshot.config().guide_markdown();
    let root = snapshot.project_root().as_path();
    resolve_named_config_file_path(root, GUIDE_FILE_NAME)?;
    SpecBoardDir::new(root).write_file(GUIDE_FILE_NAME, &content)?;
    Ok(payload(ConfigFileTarget::Guide, content))
}

#[tauri::command]
pub fn get_config_files(state: State<'_, Arc<AppState>>) -> Result<GetConfigFilesPayload, String> {
    get_config_files_impl(state.inner()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn regenerate_guide(state: State<'_, Arc<AppState>>) -> Result<ConfigFilePayload, String> {
    regenerate_guide_impl(state.inner()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_config_file(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    args: OpenConfigFileArgs,
) -> Result<(), String> {
    let result = (|| {
        let target = OpenConfigFileTarget::try_from(args.target.as_str())?;
        let snapshot = snapshot(state.inner())?;
        let path = resolve_config_file_path(snapshot.project_root().as_path(), target)?;
        app.opener()
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|error| ConfigFileCommandError::Open(error.to_string()))
    })();
    result.map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reveal_config_folder(app: AppHandle, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let result = (|| {
        let snapshot = snapshot(state.inner())?;
        let path = resolve_config_folder_path(snapshot.project_root().as_path())?;
        app.opener()
            .open_path(path.to_string_lossy(), None::<&str>)
            .map_err(|error| ConfigFileCommandError::Open(error.to_string()))
    })();
    result.map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "config_files_tests.rs"]
mod config_files_tests;
