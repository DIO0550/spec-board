//! `add_link` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::state::AppState;
use crate::task::add_link::args::AddLinkArgs;
use crate::task::add_link::error::{AddLinkCommandError, AddLinkError};
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::task_index::{AddLinkOutcome, Task, TaskIndex};

/// `add_link` Tauri command 薄層。
#[tauri::command]
pub fn add_link(state: State<'_, Arc<AppState>>, args: AddLinkArgs) -> Result<Task, String> {
    add_link_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn add_link_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: AddLinkArgs,
) -> Result<Task, AddLinkCommandError> {
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    let project_root = state
        .project_path()?
        .ok_or(AddLinkCommandError::NoProjectOpen)?;

    let intent = args
        .into_intent(project_root.as_path())
        .map_err(AddLinkCommandError::Validation)?;
    let source_rel = intent.source.clone();
    let source_abs = project_root.join(&source_rel);

    let snapshot = state.tasks_snapshot()?;
    let index = TaskIndex::new(snapshot);
    let existing_source = index
        .find_by_path(source_rel.as_path())
        .cloned()
        .ok_or_else(|| AddLinkError::SourceNotFound {
            path: source_rel.to_string_lossy().into_owned(),
        })?;

    let bytes = match io.read(&source_abs) {
        Ok(b) => b,
        Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
            return Err(AddLinkError::SourceNotFound {
                path: source_rel.to_string_lossy().into_owned(),
            }
            .into());
        }
        Err(e) => return Err(e.into()),
    };

    let parsed = frontmatter::parse_bytes(&bytes)
        .map_err(|e| AddLinkError::ParseFailed(e.to_string()))?
        .ok_or_else(|| AddLinkError::ParseFailed("no frontmatter delimiter found".to_string()))?;

    let outcome = index
        .plan_add_link(
            project_root.as_path(),
            intent.clone(),
            &existing_source,
            parsed,
        )
        .map_err(AddLinkCommandError::Validation)?;

    match outcome {
        AddLinkOutcome::NoOp { existing_task } => Ok(existing_task),
        AddLinkOutcome::Write {
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

            // commit_cache が SourceVanished / TargetVanished で失敗した場合、
            // disk への write はすでに完了しているため、watcher event を
            // 通常経路で処理して cache を disk に追従させる必要がある。
            // write_ignore に entry が残ったままだと event が consume されて
            // cache が永続的に disk と乖離するので、commit 失敗時は unregister
            // して watcher 側で再走させる（create_task_impl と同型）。
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
/// source / target の存在確認・派生フィールドの保持マージ・cycle member の
/// `parent=None` 維持・target `reverse_links` への append といったドメインロジックは
/// すべて `TaskIndex::commit_add_link_into_cache` に閉じる。effect 層はロック取得と
/// エラーの詰め替えのみを担う。
fn commit_cache(
    state: &AppState,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &Task,
) -> Result<Task, AddLinkCommandError> {
    let returned: Result<Task, AddLinkError> =
        state.with_tasks_cache_mut(|cache: &mut HashMap<_, Task>| {
            TaskIndex::commit_add_link_into_cache(
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
