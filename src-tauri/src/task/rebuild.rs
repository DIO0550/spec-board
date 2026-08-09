//! disk 上の `.md` から `Task` 一覧を再構築する共通パイプライン。
//!
//! `open_project`（初回ロード）と `watcher_event`（batch の rescan 由来の
//! full rescan）が同じ関数を通ることで、両者のフィルタ条件・親子/逆リンク構築が
//! 恒久的に一致することを保証する。片側だけ条件が変わると「初回 scan で読まれない
//! ファイルが watcher 経由で現れる」ような非対称なバグになる。
//!
//! 派生値の構築は [`TaskIndex::rebuild_derived_with_warnings`] に委譲する。
//! 本モジュールは「走査して parse する」までを担い、集約の不変条件は aggregate
//! 側に置いたままにする。
//!
//! 本関数は **`AppState` の lock を一切取らない**。走査・パースは lock 外で行い、
//! 呼び出し側が結果を短い critical section で cache へ反映する契約。そのため
//! 「走査中に resident session が変わっていないか」の確認と反映は呼び出し側の責務
//! （expected SessionId + SessionRevision の session commit）。
//!
//! ファイル読み取りは `TaskIo` port 経由。テストは `InMemoryTaskIo` を注入して
//! 実 FS 非依存に parse / skip の分岐を検証できる。

use std::path::{Path, PathBuf};

use spec_board_fs::task::file_scanner::{
    scan_md_files_with_warnings, ScanError, ScanWarning, ScanWarningCode,
};

use crate::config::column_name::ColumnName;
use crate::project::load_warning::{
    deduplicate_and_sort, ProjectLoadWarning, ProjectLoadWarningCode, ProjectLoadWarningStage,
};
use crate::task::io::TaskIo;
use crate::task::parse::{task_from_markdown, TaskParseContext, TaskParseError};
use crate::task::task_index::{Task, TaskIndex};

/// [`rebuild_tasks_from_disk`] の失敗理由。
#[derive(Debug, thiserror::Error)]
pub enum RebuildTasksError {
    #[error("failed to scan project directory: {0}")]
    Scan(#[from] ScanError),
    #[error("failed to build parent hierarchy: {0}")]
    Hierarchy(#[from] TaskParseError),
}

/// disk 上の md から再構築した task と recoverable warning の組。
#[derive(Debug, PartialEq)]
pub struct TaskRebuildReport {
    pub tasks: Vec<Task>,
    pub warnings: Vec<ProjectLoadWarning>,
}

/// root 配下を再走査して Task 一覧だけを返す互換 wrapper。
pub fn rebuild_tasks_from_disk(
    root: &Path,
    default_status: &ColumnName,
    io: &dyn TaskIo,
) -> Result<Vec<Task>, RebuildTasksError> {
    Ok(rebuild_tasks_from_disk_with_report(root, default_status, io)?.tasks)
}

/// root 配下を再走査して task と、走査・read・parse の warning を再構築する。
///
/// 個々の md の read / parse 失敗は warning に変換して skip し、全体は成功させる。
/// scan root の失敗と親チェーンの深さ超過・循環だけは従来どおり Err になる。
pub fn rebuild_tasks_from_disk_with_report(
    root: &Path,
    default_status: &ColumnName,
    io: &dyn TaskIo,
) -> Result<TaskRebuildReport, RebuildTasksError> {
    let scan = scan_md_files_with_warnings(root)?;
    let mut warnings: Vec<ProjectLoadWarning> = scan
        .warnings
        .into_iter()
        .map(project_warning_from_scan)
        .collect();
    let (tasks, task_warnings) = collect_tasks(root, &scan.items, default_status, io);
    warnings.extend(task_warnings);
    let tasks = TaskIndex::new(tasks)
        .rebuild_derived_with_warnings()?
        .into_tasks();

    Ok(TaskRebuildReport {
        tasks,
        warnings: deduplicate_and_sort(warnings),
    })
}

fn project_warning_from_scan(warning: ScanWarning) -> ProjectLoadWarning {
    let code = match warning.code {
        ScanWarningCode::EntryError => ProjectLoadWarningCode::ScanEntryError,
        ScanWarningCode::MetadataError => ProjectLoadWarningCode::MetadataError,
        ScanWarningCode::FileTooLarge => ProjectLoadWarningCode::FileTooLarge,
        ScanWarningCode::BinaryFile => ProjectLoadWarningCode::BinaryFile,
        ScanWarningCode::InvalidPath => ProjectLoadWarningCode::InvalidPath,
        ScanWarningCode::UnreadableFile => ProjectLoadWarningCode::UnreadableFile,
    };
    ProjectLoadWarning::new(
        code,
        ProjectLoadWarningStage::Scan,
        warning.path,
        warning.message,
    )
}

/// 走査結果の md から Task と warning を集める。
fn collect_tasks(
    root: &Path,
    md_paths: &[PathBuf],
    default_status: &ColumnName,
    io: &dyn TaskIo,
) -> (Vec<Task>, Vec<ProjectLoadWarning>) {
    let mut tasks = Vec::with_capacity(md_paths.len());
    let mut warnings = Vec::new();
    for rel_path in md_paths {
        let absolute = root.join(rel_path);
        let bytes = match io.read(&absolute) {
            Ok(bytes) => bytes,
            Err(err) => {
                log::warn!("failed to read task file {}: {err}", absolute.display());
                warnings.push(ProjectLoadWarning::new(
                    ProjectLoadWarningCode::TaskReadFailed,
                    ProjectLoadWarningStage::Read,
                    Some(rel_path.to_string_lossy().into_owned()),
                    err.to_string(),
                ));
                continue;
            }
        };
        let context = TaskParseContext {
            file_path: rel_path.clone(),
            default_status: default_status.clone(),
        };
        match task_from_markdown(&bytes, &context) {
            Ok(task) => tasks.push(task),
            Err(err) => {
                log::warn!("failed to parse task file {}: {err}", absolute.display());
                warnings.push(ProjectLoadWarning::new(
                    ProjectLoadWarningCode::FrontmatterParseFailed,
                    ProjectLoadWarningStage::Parse,
                    Some(rel_path.to_string_lossy().into_owned()),
                    err.to_string(),
                ));
            }
        }
    }
    (tasks, warnings)
}

#[cfg(test)]
#[path = "rebuild_tests.rs"]
mod rebuild_tests;
