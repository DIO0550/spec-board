//! `create_task` Tauri command 薄層 + effect 層。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use super::args::CreateTaskArgs;
use super::content::build_task_content;
use super::error::CreateTaskCommandError;
use super::filename::{
    build_existing_filenames_in_dir, build_new_filename, join_rel_path, resolve_target_dir,
};
use crate::config::column_name::ColumnName;
use crate::state::AppState;
use crate::task::frontmatter::parse as parse_frontmatter;
use crate::task::parse::{task_from_parsed, TaskParseContext};
use crate::task::task_content::TaskContent;
use crate::task::task_file_name::TaskFileName;
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::{Task, TaskIndex};
use crate::task::task_title::TaskTitle;

/// `create_task` Tauri command 薄層。
///
/// `create_task_impl` を呼び、エラーは Display 文字列化して FE へ返す。
#[tauri::command]
pub fn create_task(state: State<'_, Arc<AppState>>, args: CreateTaskArgs) -> Result<Task, String> {
    create_task_impl(state.inner(), args).map_err(|e| e.to_string())
}

/// `create_task` の effect 層本体（テスト境界）。
pub(crate) fn create_task_impl(
    state: &AppState,
    args: CreateTaskArgs,
) -> Result<Task, CreateTaskCommandError> {
    // 1. preflight (side effect 前の lock 健全性確認)
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    // 2. snapshot + project root
    let project_root = state
        .project_path()?
        .ok_or(CreateTaskCommandError::NoProjectOpen)?;
    let snapshot = state.tasks_snapshot()?;

    // 3. TaskIndex aggregate から parent 解決 + chain 検証
    let index = TaskIndex::from(snapshot);
    let parent_index = index.validate_new_parent(args.parent.as_deref())?;

    // 4. 配置先 dir / filename / content の決定
    let snapshot_slice = index.as_slice();
    let target_dir = resolve_target_dir(parent_index, snapshot_slice);
    let existing = build_existing_filenames_in_dir(snapshot_slice, &target_dir);
    let task_title = TaskTitle::from_lenient(args.title.clone());
    let filename: TaskFileName = build_new_filename(&task_title, &existing)?;
    let rel_path: PathBuf = join_rel_path(&target_dir, &filename);
    let abs_path = project_root.join(&rel_path);
    let target_dir_abs = project_root.join(&target_dir);

    // 5. content 組み立て（TaskContent VO で scanner eligible を強制）
    let resolved_parent_path =
        parent_index.map(|i| snapshot_slice[i].file_path.as_str().to_string());
    let content: TaskContent = build_task_content(&args, resolved_parent_path.as_deref())?;

    // 6. augmented hierarchy 検証（FS write 前に dangling 解決 cycle/too deep を弾く）
    let provisional = provisional_task(&rel_path, &args, resolved_parent_path.as_deref());
    index.validate_with_new_task(&provisional, args.parent.as_deref())?;

    // 7. watcher 起動有無 probe
    let watcher_active = state.is_watcher_installed()?;

    // 8. ディレクトリ確保
    std::fs::create_dir_all(&target_dir_abs)?;

    // 9. write_ignore 登録 → 排他 create write
    if watcher_active {
        state.write_ignore().register(&abs_path)?;
    }
    let mut file = match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&abs_path)
    {
        Ok(f) => f,
        Err(err) => {
            if watcher_active {
                let _ = state.write_ignore().unregister(&abs_path);
            }
            return Err(CreateTaskCommandError::Io(err));
        }
    };
    if let Err(err) = std::io::Write::write_all(&mut file, content.as_bytes()) {
        drop(file);
        if let Err(rm_err) = std::fs::remove_file(&abs_path) {
            if rm_err.kind() != std::io::ErrorKind::NotFound {
                log::warn!(
                    "create_task: failed to clean up partial file `{}`: {rm_err}",
                    abs_path.display()
                );
            }
        }
        if watcher_active {
            let _ = state.write_ignore().unregister(&abs_path);
        }
        return Err(CreateTaskCommandError::Io(err));
    }
    drop(file);

    // 10. post-write phase
    let result = parse_and_insert_into_cache(state, &content, &rel_path, args.status.clone());
    if result.is_err() && watcher_active {
        let _ = state.write_ignore().unregister(&abs_path);
    }
    result
}

/// hierarchy 検証用に最低限のフィールドだけ埋めた Task を作る。
fn provisional_task(
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

/// post-write phase: 書き込んだ md を再 parse → Task に変換 → cache に差分挿入。
fn parse_and_insert_into_cache(
    state: &AppState,
    content: &TaskContent,
    rel_path: &Path,
    status: String,
) -> Result<Task, CreateTaskCommandError> {
    let parsed = parse_frontmatter(content.as_str())?.expect("just-written frontmatter must parse");
    let ctx = TaskParseContext {
        file_path: rel_path.to_path_buf(),
        default_status: ColumnName::from_lenient(status),
    };
    let task = task_from_parsed(parsed, &ctx);
    let final_task =
        state.with_tasks_cache_mut(|cache| TaskIndex::insert_new_task_into_cache(cache, task))?;
    Ok(final_task)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
