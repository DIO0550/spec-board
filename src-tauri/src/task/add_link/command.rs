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
use crate::task::task_index::{
    find_task_by_normalized, find_task_mut_by_normalized, AddLinkOutcome, Task, TaskIndex,
};

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
    let existing_source = snapshot
        .iter()
        .find(|t| Path::new(t.file_path.as_str()) == source_rel.as_path())
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

    let index = TaskIndex::new(snapshot);
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

            let returned = commit_cache(state, &source_rel, &target_normalized, &updated_task)?;
            Ok(returned)
        }
    }
}

/// snapshot 取得から本関数呼出までの間に他コマンドが cache を変更すると、
/// ディスクは更新済みなのに source / target のいずれかが cache から消えている
/// ケースが起こり得る。source / target 両方の存在を **先に確認** してから
/// mutate に入り、`TargetVanished` 時に source だけ書き換わる部分更新を防ぐ。
fn commit_cache(
    state: &AppState,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &Task,
) -> Result<Task, AddLinkCommandError> {
    let source_key = source_rel.to_path_buf();
    let target_norm = target_normalized.to_string();
    let updated = updated_task.clone();

    let returned: Result<Task, AddLinkError> =
        state.with_tasks_cache_mut(|cache: &mut HashMap<_, Task>| {
            if !cache.contains_key(&source_key) {
                return Err(AddLinkError::SourceVanished {
                    path: source_key.to_string_lossy().into_owned(),
                });
            }
            if find_task_by_normalized(cache, &target_norm).is_none() {
                return Err(AddLinkError::TargetVanished {
                    path: target_norm.clone(),
                });
            }

            // 派生フィールド (children / reverse_links) を保持しつつ parse 由来
            // フィールドのみ上書きする。`task_from_parsed` は children /
            // reverse_links を空で返すため、cache 既存値で覆い直す必要がある。
            let source_entry = cache
                .get_mut(&source_key)
                .expect("source presence verified above");
            let preserved_children = std::mem::take(&mut source_entry.children);
            let preserved_reverse = std::mem::take(&mut source_entry.reverse_links);
            *source_entry = Task {
                children: preserved_children,
                reverse_links: preserved_reverse,
                ..updated.clone()
            };
            let returned_task = source_entry.clone();

            // target の reverse_links に source を append。既に push 済みなら冪等に skip。
            let target_task = find_task_mut_by_normalized(cache, &target_norm)
                .expect("target presence verified above");
            if !target_task
                .reverse_links
                .iter()
                .any(|p| p == &updated.file_path)
            {
                target_task.reverse_links.push(updated.file_path.clone());
            }

            Ok(returned_task)
        })?;

    Ok(returned?)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
