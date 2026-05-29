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
use crate::task::task_index::{find_task_mut_by_normalized, RemoveLinkOutcome, Task, TaskIndex};
use crate::task::warning::has_parent_cycle_warning;

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

/// snapshot 取得から本関数呼出までの間に他コマンドが cache を変更すると、source
/// が cache から消えていることがある。先に source の存在確認をしてから mutate に
/// 入る。target は cache に存在しなくても fail にしない（dangling link 掃除を
/// 許容するため、add_link と異なる）。
fn commit_cache(
    state: &AppState,
    source_rel: &Path,
    target_normalized: &str,
    updated_task: &Task,
) -> Result<Task, RemoveLinkCommandError> {
    let source_key = source_rel.to_path_buf();
    let target_norm = target_normalized.to_string();
    let updated = updated_task.clone();

    let returned: Result<Task, RemoveLinkError> =
        state.with_tasks_cache_mut(|cache: &mut HashMap<_, Task>| {
            if !cache.contains_key(&source_key) {
                return Err(RemoveLinkError::SourceVanished {
                    path: source_key.to_string_lossy().into_owned(),
                });
            }

            // 派生フィールド (children / reverse_links / warnings) を保持しつつ
            // parse 由来フィールドのみ上書きする。remove_link は parent / title /
            // status / labels / extras を一切変更せず links を縮めるだけのため、
            // warnings は既存値の保持で正しい状態が維持される。
            //
            // parent は通常は `updated_task` 側（disk と一致した値）を採用するが、
            // 既存 cache が ParentCycle warning を持つ場合に限り cache 側の
            // `parent=None` を維持する。これは scan で循環判定されたノードの
            // cycle 状態を link 削除程度の操作で崩さないため。ファイル本体が
            // 外部編集で変わった場合は watcher 再 scan で再判定される。
            let source_entry = cache
                .get_mut(&source_key)
                .expect("source presence verified above");
            let was_cycle_member = has_parent_cycle_warning(&source_entry.warnings);
            let preserved_children = std::mem::take(&mut source_entry.children);
            let preserved_reverse = std::mem::take(&mut source_entry.reverse_links);
            let preserved_warnings = std::mem::take(&mut source_entry.warnings);
            let preserved_parent = if was_cycle_member {
                source_entry.parent.take()
            } else {
                updated.parent.clone()
            };
            *source_entry = Task {
                children: preserved_children,
                reverse_links: preserved_reverse,
                warnings: preserved_warnings,
                parent: preserved_parent,
                ..updated.clone()
            };

            // target の reverse_links から source を除去。cache に target が存在
            // しない場合は orphan link 掃除のユースケースを許容するため fail にせず
            // skip する。self-link（source == target）のケースでは source 自身の
            // reverse_links が retain されるため、戻り値は target update 後に
            // cache から再取得する必要がある。
            if let Some(target_task) = find_task_mut_by_normalized(cache, &target_norm) {
                target_task
                    .reverse_links
                    .retain(|p| p != &updated.file_path);
            }

            let returned_task = cache
                .get(&source_key)
                .expect("source presence verified above")
                .clone();

            Ok(returned_task)
        })?;

    Ok(returned?)
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
