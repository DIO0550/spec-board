//! `create_task` Tauri command 薄層 + effect 層。
//!
//! effect 層 (`create_task_impl`) は AppState lock / 副作用 / cache commit を
//! 担当し、純粋計算は aggregate `TaskIndex::plan_create` に委譲する。
//! 標準 fs API への直接呼び出しは持たず、すべての I/O は `TaskIo` ポート経由で行う。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use super::args::CreateTaskArgs;
use super::error::CreateTaskCommandError;
use crate::config::column_name::ColumnName;
use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::frontmatter::parse as parse_frontmatter;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::parse::{task_from_parsed, TaskParseContext};
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_content::TaskContent;
use crate::task::task_index::{CreateTaskIntent, Task, TaskIndex};

/// `create_task` Tauri command 薄層。
///
/// `create_task_impl` を呼び、エラーは Display 文字列化して FE へ返す。
#[tauri::command]
pub fn create_task(state: State<'_, Arc<AppState>>, args: CreateTaskArgs) -> Result<Task, String> {
    create_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `create_task` の effect 層本体（テスト境界）。
///
/// resident planningとcache applyをI/O前に完了し、exact-root writer lease内で
/// revision/resource preflight → disk write → full identity commitを行う。
pub(crate) fn create_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: CreateTaskArgs,
) -> Result<Task, CreateTaskCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<Task, CreateTaskCommandError> {
        let intent = CreateTaskIntent::from(args);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let outcome = index.plan_create(snapshot.project_root().as_path(), &intent)?;
        let (next_tasks, created_task) = plan_cache_insert(
            snapshot.tasks(),
            &outcome.content,
            &outcome.rel_path,
            outcome.status.clone(),
        )?;
        let resources = state.preflight_session_write(snapshot)?;

        // directory作成失敗時はmarkerを登録しない。
        io.ensure_dir(&outcome.target_dir_abs)?;
        let registered_paths = vec![outcome.abs_path.clone()];
        resources.write_ignore().register(&outcome.abs_path)?;

        // partial-write cleanupはTaskIo側に閉じる。既存file collision時に
        // command層からremoveを呼ぶと既存fileを消すため、markerだけ解除する。
        if let Err(error) = io.write_new(&outcome.abs_path, outcome.content.as_bytes()) {
            cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
            return Err(error.into());
        }

        commit_or_resync_under_lease(
            state,
            target.project_root(),
            &snapshot.identity(),
            &resources,
            &registered_paths,
            ResyncSource::Tasks { task_io: io },
            "create_task",
            move |session| {
                session.replace_tasks(next_tasks);
                created_task
            },
        )
    })
}

/// generated contentをTaskへ変換し、cloned task mapへ差分追加したcommit planを返す。
fn plan_cache_insert(
    tasks: &HashMap<PathBuf, Task>,
    content: &TaskContent,
    rel_path: &Path,
    status: ColumnName,
) -> Result<(HashMap<PathBuf, Task>, Task), CreateTaskCommandError> {
    let parsed = parse_frontmatter(content.as_str())?.expect("just-written frontmatter must parse");
    let context = TaskParseContext {
        file_path: rel_path.to_path_buf(),
        default_status: status,
    };
    let task = task_from_parsed(parsed, &context);
    let mut next_tasks = tasks.clone();
    let created_task = TaskIndex::insert_new_task_into_cache(&mut next_tasks, task);
    Ok((next_tasks, created_task))
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
