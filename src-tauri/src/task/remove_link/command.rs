//! `remove_link` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::state::AppState;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::remove_link::args::RemoveLinkArgs;
use crate::task::remove_link::error::{RemoveLinkCommandError, RemoveLinkError};
use crate::task::task_index::{RemoveLinkOutcome, Task, TaskIndex};

/// `remove_link` Tauri command 薄層。
#[tauri::command]
pub fn remove_link(state: State<'_, Arc<AppState>>, args: RemoveLinkArgs) -> Result<Task, String> {
    remove_link_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn remove_link_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: RemoveLinkArgs,
) -> Result<Task, RemoveLinkCommandError> {
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    let project_root = state
        .project_path()?
        .ok_or(RemoveLinkCommandError::NoProjectOpen)?;

    let intent = args
        .into_intent(project_root.as_path())
        .map_err(RemoveLinkCommandError::Validation)?;
    let source_rel = intent.source.clone();
    let source_abs = project_root.join(&source_rel);

    let snapshot = state.tasks_snapshot()?;
    let existing_source = snapshot
        .iter()
        .find(|t| Path::new(t.file_path.as_str()) == source_rel.as_path())
        .cloned()
        .ok_or_else(|| RemoveLinkError::SourceNotFound {
            path: source_rel.to_string_lossy().into_owned(),
        })?;

    let bytes = match io.read(&source_abs) {
        Ok(b) => b,
        Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
            return Err(RemoveLinkError::SourceNotFound {
                path: source_rel.to_string_lossy().into_owned(),
            }
            .into());
        }
        Err(e) => return Err(e.into()),
    };

    let parsed = frontmatter::parse_bytes(&bytes)
        .map_err(|e| RemoveLinkError::ParseFailed(e.to_string()))?
        .ok_or_else(|| {
            RemoveLinkError::ParseFailed("no frontmatter delimiter found".to_string())
        })?;

    let index = TaskIndex::new(snapshot);
    let outcome = index
        .plan_remove_link(
            project_root.as_path(),
            intent.clone(),
            &existing_source,
            parsed,
        )
        .map_err(RemoveLinkCommandError::Validation)?;

    match outcome {
        RemoveLinkOutcome::NoOp { existing_task } => Ok(existing_task),
        RemoveLinkOutcome::Write {
            updated_task,
            file_content,
            target_normalized,
        } => {
            let watcher_active = state.is_watcher_installed()?;
            if watcher_active {
                state.write_ignore().register(&source_abs)?;
            }
            if let Err(err) = io.write_existing(&source_abs, file_content.as_bytes()) {
                if watcher_active {
                    let _ = state.write_ignore().unregister(&source_abs);
                }
                return Err(err.into());
            }

            // commit_cache が SourceVanished で失敗した場合、disk への write は
            // 完了済みのため watcher event を通常経路で処理して cache を disk に
            // 追従させる必要がある。write_ignore に entry が残ったままだと event が
            // consume されて cache が永続的に disk と乖離するので、commit 失敗時は
            // unregister して watcher 側で再走させる（add_link_impl と同型）。
            match commit_cache(state, &source_rel, &target_normalized, &updated_task) {
                Ok(returned) => Ok(returned),
                Err(err) => {
                    if watcher_active {
                        let _ = state.write_ignore().unregister(&source_abs);
                    }
                    Err(err)
                }
            }
        }
    }
}

/// cache lock を取得し、cache 差分更新を `TaskIndex` の aggregate メソッドに委譲する。
///
/// source の存在確認・派生フィールドの保持マージ・cycle member の `parent=None`
/// 維持・target `reverse_links` からの除去（self-link 時の戻り値再取得含む）といった
/// ドメインロジックはすべて `TaskIndex::commit_remove_link_into_cache` に閉じる。
/// effect 層はロック取得とエラーの詰め替えのみを担う。
fn commit_cache(
    state: &AppState,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &Task,
) -> Result<Task, RemoveLinkCommandError> {
    let returned: Result<Task, RemoveLinkError> =
        state.with_tasks_cache_mut(|cache: &mut HashMap<_, Task>| {
            TaskIndex::commit_remove_link_into_cache(
                cache,
                source_rel,
                target_normalized,
                updated_task,
            )
        })?;

    Ok(returned?)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
