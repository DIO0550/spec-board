//! `update_columns` Tauri command 本体。
//!
//! カラムの追加・削除・並び替え・名前変更・完了カラム変更を 1 コマンドで処理する。
//! コア計算は `Config::plan_update_columns` aggregate method に集約し、
//! effect 層 `update_columns_impl` で md 一括書き換え（トランザクション的ロールバック付き）
//! → `config.json` atomic write → `AppState` commit → `tasks_cache` in-place 更新
//! → GUIDE.md 再生成、の順で適用する。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use thiserror::Error;

use std::sync::Arc;

use tauri::State;

use crate::config::{
    load_or_default, write_guide_markdown_best_effort, Config, ConfigWriter, FsConfigWriter,
    LoadConfigError, RenameTarget,
};
use crate::project_session::conflict_recovery::{resync_if_same_project_under_lease, ResyncSource};
use crate::state::{AppState, AppStateError, SessionWriteError};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::document::{Patch, TaskDocument, TaskDocumentError, TaskPatch};
use crate::task::frontmatter::FrontmatterError;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use spec_board_fs::config::config_io;
use spec_board_fs::watcher::write_ignore::{WriteIgnoreError, WriteIgnoreRegistry};

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

    #[error("カラム名の変更対象 md の読み込みに失敗しました: {path}", path = path.display())]
    RenameReadFailed {
        path: PathBuf,
        #[source]
        source: TaskIoError,
    },

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
    #[error(transparent)]
    SessionWrite(SessionWriteError),
}

impl From<AppStateError> for UpdateColumnsError {
    fn from(_: AppStateError) -> Self {
        UpdateColumnsError::StateLockPoisoned
    }
}

impl From<WriteIgnoreError> for UpdateColumnsError {
    fn from(err: WriteIgnoreError) -> Self {
        match err {
            WriteIgnoreError::LockPoisoned => UpdateColumnsError::StateLockPoisoned,
        }
    }
}

impl From<SessionWriteError> for UpdateColumnsError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            error => Self::SessionWrite(error),
        }
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
    update_columns_impl_with_loader(
        state.inner(),
        &FsTaskIo,
        &FsConfigWriter,
        &load_or_default,
        args,
    )
    .map_err(|e| e.to_string())
}

/// `update_columns` の effect 層本体。
///
/// `plan_update_columns` aggregate の Plan を実 fs / state に適用する。
/// 失敗時は既に書き換えた md を原本に戻すロールバックを行う。
///
/// # Errors
///
/// 詳細は [`UpdateColumnsError`] の各 variant を参照。
#[cfg(test)]
pub(crate) fn update_columns_impl(
    state: &AppState,
    io: &dyn TaskIo,
    config_writer: &dyn ConfigWriter,
    args: UpdateColumnsArgs,
) -> Result<(), UpdateColumnsError> {
    update_columns_impl_with_loader(state, io, config_writer, &load_or_default, args)
}

pub(crate) fn update_columns_impl_with_loader(
    state: &AppState,
    io: &dyn TaskIo,
    config_writer: &dyn ConfigWriter,
    load_config: &dyn Fn(&Path) -> Result<Config, LoadConfigError>,
    args: UpdateColumnsArgs,
) -> Result<(), UpdateColumnsError> {
    state.with_project_writer_lease(|target, snapshot| {
        let tasks_snapshot: Vec<_> = snapshot.tasks().values().cloned().collect();
        let plan = snapshot
            .config()
            .plan_update_columns(&args, &tasks_snapshot)?;
        if plan.is_noop {
            return Ok(());
        }

        let project_root = snapshot.project_root().as_path().to_path_buf();
        let renamed_statuses: HashMap<CanonicalTaskPath, &str> = plan
            .rename_targets
            .iter()
            .map(|target| {
                (
                    CanonicalTaskPath::new(target.rel_path.as_str()),
                    target.new_status.as_str(),
                )
            })
            .collect();
        let candidates = snapshot
            .tasks()
            .iter()
            .map(|(path, task)| {
                renamed_statuses.get(path).map_or_else(
                    || task.to_parsed_task(),
                    |status| task.with_status_candidate(status),
                )
            })
            .collect();
        let next_tasks = crate::task::task_index::ResolvedTaskSet::resolve_lenient(candidates)
            .expect("column rename preserves the resolved parent hierarchy");

        // resident plan完成後、disk read/marker/writeより先にrevisionをpreflightする。
        let resources = state.preflight_session_write(snapshot)?;
        let abs_for = |target: &RenameTarget| project_root.join(target.rel_path.as_str());

        let mut originals: HashMap<PathBuf, Vec<u8>> = HashMap::new();
        for target in &plan.rename_targets {
            let abs = abs_for(target);
            let bytes = io
                .read(&abs)
                .map_err(|source| UpdateColumnsError::RenameReadFailed {
                    path: abs.clone(),
                    source,
                })?;
            originals.insert(abs, bytes);
        }

        let registered_paths: Vec<PathBuf> = if plan.rename_targets.is_empty() {
            Vec::new()
        } else {
            let paths: Vec<PathBuf> = plan.rename_targets.iter().map(&abs_for).collect();
            resources.write_ignore().register_bulk(&paths)?;
            paths
        };

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
                        rollback_and_cleanup(
                            &written,
                            &originals,
                            io,
                            resources.write_ignore(),
                            &registered_paths,
                        )?;
                        return Err(UpdateColumnsError::RenameWriteFailed { path: abs, source });
                    }
                },
                Ok(None) => {
                    rollback_and_cleanup(
                        &written,
                        &originals,
                        io,
                        resources.write_ignore(),
                        &registered_paths,
                    )?;
                    return Err(UpdateColumnsError::RenameMissingFrontmatter { path: abs });
                }
                Err(source) => {
                    rollback_and_cleanup(
                        &written,
                        &originals,
                        io,
                        resources.write_ignore(),
                        &registered_paths,
                    )?;
                    return Err(UpdateColumnsError::RenameParseFailed { path: abs, source });
                }
            }
        }

        let next_config = plan.new_config;
        let config_path = config_io::config_path(&project_root);
        let content = match serde_json::to_string_pretty(&next_config) {
            Ok(content) => content,
            Err(source) => {
                rollback_and_cleanup(
                    &written,
                    &originals,
                    io,
                    resources.write_ignore(),
                    &registered_paths,
                )?;
                return Err(UpdateColumnsError::ConfigSerializeFailed { source });
            }
        };
        if let Err(source) = config_writer.write_atomic(&config_path, &content) {
            rollback_and_cleanup(
                &written,
                &originals,
                io,
                resources.write_ignore(),
                &registered_paths,
            )?;
            return Err(UpdateColumnsError::ConfigWriteFailed {
                path: config_path,
                source,
            });
        }

        let guide_config = next_config.clone();
        let commit = state.commit_session_write(&snapshot.identity(), move |session| {
            session.replace_config(next_config);
            session.replace_tasks(next_tasks);
        });
        match commit {
            Ok(_) => {
                write_guide_markdown_best_effort(&project_root, &guide_config);
                Ok(())
            }
            Err(SessionWriteError::Conflict(conflict)) => {
                let recovery = resync_if_same_project_under_lease(
                    state,
                    target.project_root(),
                    &conflict,
                    ResyncSource::ConfigAndTasks {
                        task_io: io,
                        load_config,
                    },
                );
                if let Err(error) = recovery {
                    cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
                    log::warn!("update_columns conflict recovery failed: {error}");
                } else {
                    write_guide_markdown_best_effort(&project_root, &guide_config);
                }
                Err(SessionWriteError::Conflict(conflict).into())
            }
            Err(error) => {
                cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
                Err(error.into())
            }
        }
    })
}

/// 失敗パスで `register_bulk` 済み path の write_ignore エントリを掃除する best-effort helper。
///
/// 一括登録した path をそのまま放置すると、watcher の consume が one-shot のため
/// 後続の本物のユーザー編集イベントが stale な ignore エントリに飲まれてしまう。
/// 失敗時は明示的に unregister し、cache と fs の整合性は別途 `rollback_md` で復元する。
/// 内部 Mutex の poison 等は無視する（既に別エラーで失敗パスにいるため）。
fn cleanup_registered_write_ignores(registry: &WriteIgnoreRegistry, paths: &[PathBuf]) {
    for path in paths {
        let _ = registry.unregister(path);
    }
}

/// rollbackの成否にかかわらず、このoperationが登録したmarkerを掃除する。
fn rollback_and_cleanup(
    written: &[PathBuf],
    originals: &HashMap<PathBuf, Vec<u8>>,
    io: &dyn TaskIo,
    registry: &WriteIgnoreRegistry,
    registered_paths: &[PathBuf],
) -> Result<(), UpdateColumnsError> {
    let rollback = rollback_md(written, originals, io);
    cleanup_registered_write_ignores(registry, registered_paths);
    rollback
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
    let mut document = match TaskDocument::parse(bytes) {
        Ok(document) => document,
        Err(TaskDocumentError::NotTask) => return Ok(None),
        Err(TaskDocumentError::Frontmatter(error)) => return Err(error),
        Err(TaskDocumentError::Render { reason }) => {
            return Err(FrontmatterError::SerializeMessage(reason));
        }
    };

    document
        .apply(TaskPatch {
            status: Patch::Set(new_status.to_string()),
            ..TaskPatch::default()
        })
        .map_err(document_error_to_frontmatter)?;
    let rendered = document.render().map_err(document_error_to_frontmatter)?;
    Ok(Some(rendered.into_bytes()))
}

fn document_error_to_frontmatter(error: TaskDocumentError) -> FrontmatterError {
    match error {
        TaskDocumentError::NotTask => FrontmatterError::NotTask,
        TaskDocumentError::Frontmatter(error) => error,
        TaskDocumentError::Render { reason } => FrontmatterError::SerializeMessage(reason),
    }
}

#[cfg(test)]
#[path = "update_columns_tests.rs"]
mod update_columns_tests;
