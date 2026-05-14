//! `create_task` Tauri command 薄層 + effect 層。
//!
//! effect 層 (`create_task_impl`) は AppState lock / 副作用 / cache commit を
//! 担当し、純粋計算は `create_task_usecase` に委譲する。標準 fs API への
//! 直接呼び出しは持たず、すべての I/O は `TaskIo` ポート経由で行う。

use std::path::Path;
use std::sync::Arc;

use tauri::State;

use super::args::CreateTaskArgs;
use super::error::CreateTaskCommandError;
use super::usecase::create_task_usecase;
use crate::config::column_name::ColumnName;
use crate::state::AppState;
use crate::task::frontmatter::parse as parse_frontmatter;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::parse::{task_from_parsed, TaskParseContext};
use crate::task::task_content::TaskContent;
use crate::task::task_index::{Task, TaskIndex};

/// `create_task` Tauri command 薄層。
///
/// `create_task_impl` を呼び、エラーは Display 文字列化して FE へ返す。
#[tauri::command]
pub fn create_task(state: State<'_, Arc<AppState>>, args: CreateTaskArgs) -> Result<Task, String> {
    create_task_impl(state.inner(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// `create_task` の effect 層本体（テスト境界）。
///
/// I/O は `TaskIo` port 経由で実行し、標準 fs API の直接呼び出しは行わない。
/// AppState lock 取得順序契約 (`state.rs:8-19`) を維持し、純粋ユースケース
/// (`create_task_usecase`) を副作用前に呼び出すことで validation 失敗時の
/// 副作用ゼロを保証する。
pub(crate) fn create_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
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

    // 3. 純粋ユースケース呼び出し（副作用前に検証 / 計算をすべて完了させる）。
    //    `snapshot` は usecase へ所有権移譲し、内部 `TaskIndex::new` の再 clone を回避する。
    let outcome = create_task_usecase(snapshot, project_root.as_path(), &args)?;

    // 4. watcher 起動有無 probe（副作用前に lock 健全性を確認）
    let watcher_active = state.is_watcher_installed()?;

    // 5. ディレクトリ確保
    //    ensure_dir 失敗時は write_ignore に未触のまま return する。
    io.ensure_dir(&outcome.target_dir_abs)?;

    // 6. write_ignore 登録（ensure_dir 成功後 / write_new 直前）
    if watcher_active {
        state.write_ignore().register(&outcome.abs_path)?;
    }

    // 7. I/O via port (排他作成 write)
    //    partial-write cleanup は FsTaskIo::write_new 内部に閉じ込め済み。
    //    既存ファイル衝突 (AlreadyExists) 経路で既存ファイルを誤削除しない
    //    ため、本層は失敗時に追加の io.remove を呼ばない（二重削除防止）。
    if let Err(err) = io.write_new(&outcome.abs_path, outcome.content.as_bytes()) {
        if watcher_active {
            let _ = state.write_ignore().unregister(&outcome.abs_path);
        }
        return Err(err.into());
    }

    // 8. cache commit
    let result = parse_and_insert_into_cache(
        state,
        &outcome.content,
        &outcome.rel_path,
        outcome.status.clone(),
    );
    if result.is_err() && watcher_active {
        let _ = state.write_ignore().unregister(&outcome.abs_path);
    }
    result
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
