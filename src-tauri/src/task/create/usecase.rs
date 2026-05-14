//! `create_task` 純粋ユースケース層。
//!
//! AppState / `TaskIo` / `std::fs::*` / `Config` には一切触らず、
//! snapshot + project_root + args から計算済みの `CreateTaskOutcome` を返す。
//! effect 層 (`task::create::command::create_task_impl`) はこの結果を受け、
//! I/O・lock 操作・cache commit を引き受ける。

use std::path::{Path, PathBuf};

use super::args::CreateTaskArgs;
use super::content::build_task_content;
use super::error::CreateTaskError;
use super::filename::{
    build_existing_filenames_in_dir, build_new_filename, join_rel_path, resolve_target_dir,
};
use crate::config::column_name::ColumnName;
use crate::task::task_content::TaskContent;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::{Task, TaskIndex};
use crate::task::task_title::TaskTitle;

/// 純粋ユースケースの計算結果。effect 層が消費する。
#[derive(Debug)]
pub(crate) struct CreateTaskOutcome {
    pub rel_path: PathBuf,
    pub abs_path: PathBuf,
    pub target_dir_abs: PathBuf,
    pub content: TaskContent,
    /// effect 層が `with_tasks_cache_mut` 内で再 parse 後 `insert_new_task_into_cache`
    /// に渡す `default_status` 用の status 文字列（`CreateTaskArgs::status` のコピー）。
    pub status: String,
}

/// 副作用なしの純粋関数。
///
/// AppState / TaskIo / fs::* / Config に依存しない。effect 層は本関数が成功した
/// 後にのみ I/O 副作用を実行する。
///
/// 引数は現行 `AppState` API に直結する型を採用:
/// - `snapshot: &[Task]` ← `AppState::tasks_snapshot()` が返す `Vec<Task>` の slice
/// - `project_root: &Path` ← `AppState::project_path()` が返す `PathBuf` の `.as_path()`
pub(crate) fn create_task_usecase(
    snapshot: &[Task],
    project_root: &Path,
    args: &CreateTaskArgs,
) -> Result<CreateTaskOutcome, CreateTaskError> {
    let index = TaskIndex::new(snapshot.to_vec());
    let parent_index = index.validate_new_parent(args.parent.as_deref())?;

    let snapshot_slice = index.as_slice();
    let target_dir = resolve_target_dir(parent_index, snapshot_slice);
    let existing = build_existing_filenames_in_dir(snapshot_slice, &target_dir);
    let task_title = TaskTitle::from_lenient(args.title.clone());
    let filename = build_new_filename(&task_title, &existing)?;
    let rel_path: PathBuf = join_rel_path(&target_dir, &filename);
    let abs_path = project_root.join(&rel_path);
    let target_dir_abs = project_root.join(&target_dir);

    let resolved_parent_path =
        parent_index.map(|i| snapshot_slice[i].file_path.as_str().to_string());
    let content = build_task_content(args, resolved_parent_path.as_deref())?;

    let provisional = build_provisional_task(&rel_path, args, resolved_parent_path.as_deref());
    index.validate_with_new_task(&provisional, args.parent.as_deref())?;

    Ok(CreateTaskOutcome {
        rel_path,
        abs_path,
        target_dir_abs,
        content,
        status: args.status.clone(),
    })
}

/// hierarchy 検証用に最低限のフィールドだけ埋めた Task を作る。
fn build_provisional_task(
    rel_path: &Path,
    args: &CreateTaskArgs,
    resolved_parent_path: Option<&str>,
) -> Task {
    let file_path = TaskFilePath::from_lenient(rel_path.to_string_lossy().replace('\\', "/"));
    let parent = resolved_parent_path.map(TaskFilePath::from_lenient);
    Task {
        id: file_path.clone(),
        file_path,
        title: TaskTitle::from_lenient(args.title.clone()),
        status: ColumnName::from_lenient(args.status.clone()),
        priority: None,
        labels: Vec::new(),
        parent,
        links: Vec::new(),
        children: Vec::new(),
        reverse_links: Vec::new(),
        body: String::new(),
        extras: std::collections::BTreeMap::new(),
        warnings: Vec::new(),
    }
}

#[cfg(test)]
#[path = "usecase_tests.rs"]
mod usecase_tests;
