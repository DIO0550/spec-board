//! `update_columns` Tauri command 本体。
//!
//! カラムの追加・削除・並び替え・名前変更・完了カラム変更を 1 コマンドで処理する。
//! コア計算は `Config::plan_update_columns` aggregate method に集約し、
//! effect 層 `update_columns_impl` で md 一括書き換え（トランザクション的ロールバック付き）
//! → `config.json` atomic write → `AppState` commit → `tasks_cache` in-place 更新
//! → GUIDE.md 再生成、の順で適用する。

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Deserialize;
use serde_yaml_ng::Value as YamlValue;
use thiserror::Error;

use std::sync::Arc;

use tauri::State;

use crate::config::column_name::ColumnName;
use crate::config::{write_guide_markdown_best_effort, ConfigWriter, FsConfigWriter, RenameTarget};
use crate::state::{AppState, AppStateError};
use crate::task::frontmatter::{self, FrontmatterError};
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use spec_board_fs::config::config_io;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

/// `update_columns` の引数 DTO。
///
/// 全フィールド `Option` のため、FE 側は変更したい項目のみ送る。
/// すべて `None` の場合は no-op として `Ok(())` を返す。
#[derive(Debug, Clone, PartialEq, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateColumnsArgs {
    /// 新しい columns 配列。指定があれば config の columns はこの値で完全置換される。
    pub columns: Option<Vec<crate::config::Column>>,
    /// 新しい完了カラム名。`None` は「変更しない」を意味する。
    pub done_column: Option<String>,
    /// カラム名のリネーム指示。`from == to` は冪等 skip。
    pub renames: Option<Vec<ColumnRename>>,
}

/// カラム名リネームの 1 件分。
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnRename {
    pub from: String,
    pub to: String,
}

/// `update_columns` のエラー。FE 側 `TauriError.PATTERNS` で文字列マッチされる
/// ため、Display 文字列は変更しない。
#[derive(Debug, Error)]
pub enum UpdateColumnsError {
    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,

    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,

    #[error("カラムを 0 件にすることはできません")]
    EmptyColumns,

    #[error("カラム名が重複しています: {name}")]
    DuplicateColumnName { name: String },

    #[error("存在しないカラム名のリネームが指定されました: {name}")]
    UnknownRenameFrom { name: String },

    #[error("同じカラム名のリネームが複数指定されました: {name}")]
    DuplicateRenameFrom { name: String },

    #[error("リネーム後のカラム名が空です")]
    EmptyRenameTo,

    #[error("指定された完了カラムが存在しません: {name}")]
    UnknownDoneColumn { name: String },

    #[error("リネーム後のカラム名が新しい columns に含まれていません: {name}")]
    RenameToMissingFromColumns { name: String },

    #[error("カラム名の変更中にフロントマターのパースに失敗しました")]
    RenameParseFailed {
        path: PathBuf,
        #[source]
        source: FrontmatterError,
    },

    #[error("カラム名の変更対象 md にフロントマターがありません: {path}", path = path.display())]
    RenameMissingFrontmatter { path: PathBuf },

    #[error("カラム名の変更中にエラーが発生しました。変更を元に戻しました")]
    RenameWriteFailed {
        path: PathBuf,
        #[source]
        source: TaskIoError,
    },

    #[error("カラム名の変更失敗後のロールバックに失敗しました: {path}", path = path.display())]
    RenameRollbackFailed {
        path: PathBuf,
        #[source]
        source: TaskIoError,
    },

    #[error("config.json のシリアライズに失敗しました")]
    ConfigSerializeFailed {
        #[source]
        source: serde_json::Error,
    },

    #[error("config.json の書き込みに失敗しました: {path}", path = path.display())]
    ConfigWriteFailed {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

impl From<AppStateError> for UpdateColumnsError {
    fn from(_: AppStateError) -> Self {
        UpdateColumnsError::StateLockPoisoned
    }
}

impl From<WriteIgnoreError> for UpdateColumnsError {
    fn from(_: WriteIgnoreError) -> Self {
        UpdateColumnsError::StateLockPoisoned
    }
}

/// `update_columns` Tauri command 薄層。
///
/// `update_columns_impl` を呼び、エラーを文字列化して FE へ返す。
///
/// # Errors
///
/// `UpdateColumnsError::Display` で定義された各種エラー文字列を返す。
#[tauri::command]
pub fn update_columns(
    state: State<'_, Arc<AppState>>,
    args: UpdateColumnsArgs,
) -> Result<(), String> {
    update_columns_impl(state.inner(), &FsTaskIo, &FsConfigWriter, args).map_err(|e| e.to_string())
}

/// `update_columns` の effect 層本体。
///
/// `plan_update_columns` aggregate の Plan を実 fs / state に適用する。
/// 失敗時は既に書き換えた md を原本に戻すロールバックを行う。
///
/// # Errors
///
/// 詳細は [`UpdateColumnsError`] の各 variant を参照。
pub(crate) fn update_columns_impl(
    state: &AppState,
    io: &dyn TaskIo,
    config_writer: &dyn ConfigWriter,
    args: UpdateColumnsArgs,
) -> Result<(), UpdateColumnsError> {
    // (1) preflight
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    // (2) snapshot
    let project_root = state
        .project_path()?
        .ok_or(UpdateColumnsError::NoProjectOpen)?;
    let config = state.config()?.ok_or(UpdateColumnsError::NoProjectOpen)?;
    let tasks_snapshot = state.tasks_snapshot()?;

    // (3) aggregate planning（pure）
    let plan = config.plan_update_columns(&args, &tasks_snapshot)?;
    if plan.is_noop {
        return Ok(());
    }

    let abs_for = |target: &RenameTarget| project_root.join(target.rel_path.as_str());

    // (4) 原本 bytes を読み込んで HashMap に保持（key = abs_path）
    let mut originals: HashMap<PathBuf, Vec<u8>> = HashMap::new();
    for target in &plan.rename_targets {
        let abs = abs_for(target);
        let bytes = io
            .read(&abs)
            .map_err(|source| UpdateColumnsError::RenameWriteFailed {
                path: abs.clone(),
                source,
            })?;
        originals.insert(abs, bytes);
    }

    // (5) watcher 起動有無に応じて write_ignore を bulk 登録
    //     登録した path は失敗パスで unregister し、後続の本物のユーザー編集イベントが
    //     stale な ignore エントリで抑止されないようにする。
    let watcher_active = state.is_watcher_installed()?;
    let registered_paths: Vec<PathBuf> = if watcher_active && !plan.rename_targets.is_empty() {
        let paths: Vec<PathBuf> = plan.rename_targets.iter().map(&abs_for).collect();
        state.write_ignore().register_bulk(&paths)?;
        paths
    } else {
        Vec::new()
    };

    // (6) rename 対象 md を順次 atomic write。失敗時は rollback
    let mut written: Vec<PathBuf> = Vec::new();
    for target in &plan.rename_targets {
        let abs = abs_for(target);
        let original_bytes = originals
            .get(&abs)
            .expect("originals must contain abs path");

        match rewrite_status_in_md(original_bytes, &target.new_status) {
            Ok(Some(new_bytes)) => match io.write_existing(&abs, &new_bytes) {
                Ok(()) => written.push(abs),
                Err(source) => {
                    rollback_md(&written, &originals, io)?;
                    cleanup_registered_write_ignores(state, &registered_paths);
                    return Err(UpdateColumnsError::RenameWriteFailed { path: abs, source });
                }
            },
            Ok(None) => {
                rollback_md(&written, &originals, io)?;
                cleanup_registered_write_ignores(state, &registered_paths);
                return Err(UpdateColumnsError::RenameMissingFrontmatter { path: abs });
            }
            Err(source) => {
                rollback_md(&written, &originals, io)?;
                cleanup_registered_write_ignores(state, &registered_paths);
                return Err(UpdateColumnsError::RenameParseFailed { path: abs, source });
            }
        }
    }

    // (7) config.json atomic write
    let config_path = config_io::config_path(&project_root);
    let content = match serde_json::to_string_pretty(&plan.new_config) {
        Ok(s) => s,
        Err(source) => {
            rollback_md(&written, &originals, io)?;
            cleanup_registered_write_ignores(state, &registered_paths);
            return Err(UpdateColumnsError::ConfigSerializeFailed { source });
        }
    };
    if let Err(source) = config_writer.write_atomic(&config_path, &content) {
        rollback_md(&written, &originals, io)?;
        cleanup_registered_write_ignores(state, &registered_paths);
        return Err(UpdateColumnsError::ConfigWriteFailed {
            path: config_path,
            source,
        });
    }

    // (8) commit: AppState.config 差し替え → tasks_cache in-place 更新 → GUIDE.md 再生成
    state.replace_config(Some(plan.new_config.clone()))?;
    state.with_tasks_cache_mut(|cache| {
        for target in &plan.rename_targets {
            let rel = PathBuf::from(target.rel_path.as_str());
            if let Some(task) = cache.get_mut(&rel) {
                task.status = ColumnName::from_lenient(&target.new_status);
            }
        }
    })?;
    write_guide_markdown_best_effort(&project_root, &plan.new_config);

    Ok(())
}

/// 失敗パスで `register_bulk` 済み path の write_ignore エントリを掃除する best-effort helper。
///
/// 一括登録した path をそのまま放置すると、watcher の consume が one-shot のため
/// 後続の本物のユーザー編集イベントが stale な ignore エントリに飲まれてしまう。
/// 失敗時は明示的に unregister し、cache と fs の整合性は別途 `rollback_md` で復元する。
/// 内部 Mutex の poison 等は無視する（既に別エラーで失敗パスにいるため）。
fn cleanup_registered_write_ignores(state: &AppState, paths: &[PathBuf]) {
    for path in paths {
        let _ = state.write_ignore().unregister(path);
    }
}

/// rollback ループ。既に書き換え済みの md を `originals` の内容で書き戻す。
fn rollback_md(
    written: &[PathBuf],
    originals: &HashMap<PathBuf, Vec<u8>>,
    io: &dyn TaskIo,
) -> Result<(), UpdateColumnsError> {
    for path in written {
        let bytes = originals
            .get(path)
            .expect("originals must contain written path");
        if let Err(source) = io.write_existing(path, bytes) {
            return Err(UpdateColumnsError::RenameRollbackFailed {
                path: path.clone(),
                source,
            });
        }
    }
    Ok(())
}

/// md バイト列のフロントマター `status` を `new_status` に書き換えて新しいバイト列を返す。
///
/// 戻り値:
/// - `Ok(Some(bytes))` — frontmatter を持つ md で書き換えに成功
/// - `Ok(None)` — frontmatter が無い md（先頭 `---` で始まらない / 閉じ `---` が無い）。
///   effect 層側で `UpdateColumnsError::RenameMissingFrontmatter` に詰めて hard-fail し、
///   既書き換え分を rollback する責務とする。helper 自体は判定のみ。
///
/// # Errors
///
/// - YAML パース失敗 / UTF-8 非互換などは [`FrontmatterError`] をそのまま伝播する。
pub(crate) fn rewrite_status_in_md(
    bytes: &[u8],
    new_status: &str,
) -> Result<Option<Vec<u8>>, FrontmatterError> {
    let Some(mut parsed) = frontmatter::parse_bytes(bytes)? else {
        return Ok(None);
    };

    parsed.frontmatter.extras.insert(
        YamlValue::String("status".into()),
        YamlValue::String(new_status.to_string()),
    );

    Ok(Some(frontmatter::serialize(&parsed).into_bytes()))
}

#[cfg(test)]
#[path = "update_columns_tests.rs"]
mod update_columns_tests;
