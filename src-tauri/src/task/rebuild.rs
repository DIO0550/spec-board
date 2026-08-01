//! disk 上の `.md` から `Task` 一覧を再構築する共通パイプライン。
//!
//! `open_project`（初回ロード）と `watcher_event`（`FsEvent::Rescan` 由来の
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

use spec_board_fs::task::file_scanner::{scan_md_files, ScanError};

use crate::config::column_name::ColumnName;
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

/// root 配下を再走査して `Task` 一覧を再構築する。
///
/// 個々の md の read / parse 失敗は `log::warn!` して skip し、全体は成功させる。
/// 1 ファイルの破損で project 全体のロードを落とさないため。scan 自体の失敗と
/// 親チェーンの深さ超過のみ `Err` になる。
pub fn rebuild_tasks_from_disk(
    root: &Path,
    default_status: &ColumnName,
    io: &dyn TaskIo,
) -> Result<Vec<Task>, RebuildTasksError> {
    let md_paths = scan_md_files(root)?;
    let tasks = collect_tasks(root, &md_paths, default_status, io);
    Ok(TaskIndex::new(tasks)
        .rebuild_derived_with_warnings()?
        .into_tasks())
}

/// 走査結果の `.md` から `Task` を集める。
fn collect_tasks(
    root: &Path,
    md_paths: &[PathBuf],
    default_status: &ColumnName,
    io: &dyn TaskIo,
) -> Vec<Task> {
    let mut tasks = Vec::with_capacity(md_paths.len());
    for rel_path in md_paths {
        let absolute = root.join(rel_path);
        let bytes = match io.read(&absolute) {
            Ok(bytes) => bytes,
            Err(err) => {
                log::warn!("failed to read task file `{}`: {err}", absolute.display());
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
                log::warn!("failed to parse task file `{}`: {err}", absolute.display());
            }
        }
    }
    tasks
}

#[cfg(test)]
#[path = "rebuild_tests.rs"]
mod rebuild_tests;
