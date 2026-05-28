//! `update_task` Tauri command と effect 層実装。

use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::State;

use crate::state::AppState;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo, TaskIoError};
use crate::task::task_index::{Task, TaskIndex, UpdateTaskOutcome};
use crate::task::update::args::UpdateTaskArgs;
use crate::task::update::error::{UpdateTaskCommandError, UpdateTaskError};
use crate::task::warning::{TaskWarning, TaskWarningCode};

/// `update_task` Tauri command 薄層。
#[tauri::command]
pub fn update_task(state: State<'_, Arc<AppState>>, args: UpdateTaskArgs) -> Result<Task, String> {
    update_task_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn update_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: UpdateTaskArgs,
) -> Result<Task, UpdateTaskCommandError> {
    state.check_tasks_cache_lock()?;
    let _ = state.write_ignore().is_empty()?;

    let project_root = state
        .project_path()?
        .ok_or(UpdateTaskCommandError::NoProjectOpen)?;

    let intent = args
        .into_intent(project_root.as_path())
        .map_err(UpdateTaskCommandError::Validation)?;
    let rel_path = intent.file_path.clone();
    let abs = project_root.join(&rel_path);

    let snapshot = state.tasks_snapshot()?;
    let existing_task = snapshot
        .iter()
        .find(|t| Path::new(t.file_path.as_str()) == rel_path.as_path())
        .cloned()
        .ok_or_else(|| UpdateTaskError::FileNotFound(abs.clone()))?;

    let bytes = match io.read(&abs) {
        Ok(b) => b,
        Err(TaskIoError::Io(source)) if source.kind() == ErrorKind::NotFound => {
            return Err(UpdateTaskError::FileNotFound(abs.clone()).into());
        }
        Err(e) => return Err(e.into()),
    };

    let parsed = frontmatter::parse_bytes(&bytes)
        .map_err(|e| UpdateTaskError::ParseFailed(e.to_string()))?
        .ok_or_else(|| {
            UpdateTaskError::ParseFailed("no frontmatter delimiter found".to_string())
        })?;

    let index = TaskIndex::new(snapshot);
    let outcome: UpdateTaskOutcome = index
        .plan_update(project_root.as_path(), intent, &existing_task, parsed)
        .map_err(UpdateTaskCommandError::Validation)?;

    let watcher_active = state.is_watcher_installed()?;

    if watcher_active {
        state.write_ignore().register(&abs)?;
    }

    if let Err(err) = io.write_existing(&abs, outcome.file_content.as_bytes()) {
        if watcher_active {
            let _ = state.write_ignore().unregister(&abs);
        }
        return Err(err.into());
    }

    let returned = commit_cache(state, &rel_path, &outcome)?;
    Ok(returned)
}

/// cache を更新し、返却すべき最終的な Task を返す。
///
/// `plan_update` の snapshot 取得と本関数の lock 再取得の間に他コマンドが cache を
/// 変更すると、再構築用 `Vec<Task>` の hierarchy が `plan_update` 時点と乖離する
/// 可能性がある。validation を `?` で propagate して panic を避け、レース由来の
/// 不整合は `UpdateTaskCommandError::Validation` として呼び出し側に返す。
fn commit_cache(
    state: &AppState,
    rel_path: &Path,
    outcome: &UpdateTaskOutcome,
) -> Result<Task, UpdateTaskCommandError> {
    let cache_key: PathBuf = rel_path.to_path_buf();
    let returned: Result<Option<Task>, UpdateTaskError> =
        state.with_tasks_cache_mut(|cache: &mut HashMap<PathBuf, Task>| {
            if outcome.needs_full_rebuild {
                let mut values: Vec<Task> = cache.values().cloned().collect();
                let target_str = rel_path.to_string_lossy();
                if let Some(slot) = values
                    .iter_mut()
                    .find(|t| t.file_path.as_str() == target_str.as_ref())
                {
                    *slot = outcome.updated_task.clone();
                } else {
                    values.push(outcome.updated_task.clone());
                }
                let index = TaskIndex::new(values)
                    .validate_parent_hierarchy()
                    .map_err(UpdateTaskError::from)?
                    .build_children()
                    .map_err(UpdateTaskError::from)?
                    .build_reverse_links();
                cache.clear();
                for task in index.into_tasks() {
                    cache.insert(PathBuf::from(task.file_path.as_str()), task);
                }
                Ok(cache.get(&cache_key).cloned())
            } else {
                // 非 parent 更新では、scan で cycle member とマークされた状態
                // (parent=None + parentCycle warning) を新しい cache 値でも
                // 維持する。`outcome.updated_task` は disk の生の `parent:` を
                // 復活させているため、明示的に override しないとバナーが消える。
                let was_cycle_member = cache
                    .get(&cache_key)
                    .map(|prev| {
                        prev.warnings.iter().any(|w| {
                            w.code == TaskWarningCode::ParentCycle
                                && w.field.as_deref() == Some("parent")
                        })
                    })
                    .unwrap_or(false);
                let mut next = outcome.updated_task.clone();
                if was_cycle_member {
                    next.parent = None;
                    ensure_parent_cycle_warning(&mut next.warnings);
                }
                cache.insert(cache_key.clone(), next.clone());
                Ok(Some(next))
            }
        })?;

    returned?.ok_or(UpdateTaskCommandError::Validation(
        UpdateTaskError::FileNotFound(cache_key),
    ))
}

/// `warnings` に既に `ParentCycle` (field=`parent`) があれば何もせず、無ければ追加する。
fn ensure_parent_cycle_warning(warnings: &mut Vec<TaskWarning>) {
    let already = warnings
        .iter()
        .any(|w| w.code == TaskWarningCode::ParentCycle && w.field.as_deref() == Some("parent"));
    if already {
        return;
    }
    warnings.push(TaskWarning {
        code: TaskWarningCode::ParentCycle,
        field: Some("parent".to_string()),
        message: "parent chain forms a cycle".to_string(),
    });
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
