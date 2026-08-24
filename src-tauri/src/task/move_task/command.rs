//! `move_task` Tauri command と effect 層実装。
//!
//! カラム間移動（status 変更 + cardOrder 更新）と同一カラム並び替え（cardOrder のみ）を
//! 単一 command で処理する。FE 側で二段 IPC を行うと、片方だけ成功した中間状態
//! （旧 partial-move）が観測できてしまうため、両方の書き込みをここに閉じ込める。
//!
//! # ロック取得順序
//!
//! exact `ProjectRoot` writer gate → coherent session snapshot → resource/revision
//! preflight → disk writes → expected SessionId + revision の CAS commit の順に進む。
//! state lock は snapshot/commit の短い区間だけ保持し、disk I/O 中は解放する。
//!
//! # 書き込みの原子性
//!
//! task md と config.json は別ファイルのため POSIX 上のトランザクション保証はない。
//! config.json の書き込みが失敗した場合のみ task md を元の内容へ書き戻す
//! best-effort rollback を行い、それ以外の再収束は watcher / 再スキャンに委ねる。

use std::collections::HashSet;
use std::io::ErrorKind;
use std::path::Path;
use std::sync::Arc;

use spec_board_fs::config::config_io::{self, ConfigIoError};
use tauri::State;

use crate::config::{
    load_or_default, CardOrder, Config, ConfigWriter, FsConfigWriter, LoadConfigError,
};
use crate::project_session::conflict_recovery::ResyncSource;
use crate::state::AppState;
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::document::TaskDocument;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::move_task::args::MoveTaskArgs;
use crate::task::move_task::error::{MoveTaskCommandError, MoveTaskError};
use crate::task::parse::default_status_for;
use crate::task::payload::TaskPayload;
use crate::task::session_write::{cleanup_registered_write_ignores, commit_or_resync_under_lease};
use crate::task::task_file_path::TaskFilePath;
use crate::task::task_index::{MoveTaskIntent, MoveTaskOutcome, Task, TaskIndex};

/// `move_task` Tauri command 薄層。
#[tauri::command]
pub fn move_task(
    state: State<'_, Arc<AppState>>,
    args: MoveTaskArgs,
) -> Result<TaskPayload, String> {
    move_task_impl(state.inner().as_ref(), &FsTaskIo, args)
        .map(TaskPayload::from)
        .map_err(|e| e.to_string())
}

/// effect 層本体（既存テスト境界）。
pub(crate) fn move_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: MoveTaskArgs,
) -> Result<Task, MoveTaskCommandError> {
    move_task_impl_with_config_io(state, io, &FsConfigWriter, &load_or_default, args)
}

/// injected config I/Oを使うmove effect本体。
pub(crate) fn move_task_impl_with_config_io(
    state: &AppState,
    io: &dyn TaskIo,
    config_writer: &dyn ConfigWriter,
    config_loader: &dyn Fn(&Path) -> Result<Config, LoadConfigError>,
    args: MoveTaskArgs,
) -> Result<Task, MoveTaskCommandError> {
    state.with_project_writer_lease(|target, snapshot| -> Result<Task, MoveTaskCommandError> {
        let project_root = snapshot.project_root();
        let config = snapshot.config();
        let intent = args.into_intent(project_root.as_path())?;
        ensure_column_exists(config, &intent.from_column)?;
        ensure_column_exists(config, &intent.to_column)?;

        let rel_path = intent.file_path.clone();
        let abs = project_root.as_path().join(&rel_path);
        let index = TaskIndex::new(snapshot.tasks().values().cloned().collect());
        let existing = index
            .find_by_path(rel_path.as_path())
            .cloned()
            .ok_or_else(|| MoveTaskCommandError::TaskNotFound {
                path: rel_path.to_string_lossy().into_owned(),
            })?;
        if existing.status().as_str() != intent.from_column {
            return Err(MoveTaskError::StatusMismatch {
                expected: intent.from_column.clone(),
                actual: existing.status().as_str().to_string(),
            }
            .into());
        }
        // 並び照合は revision preflight / TaskIo read より前。stale な前提の移動は
        // ここで確定拒否になり、revision 消費も TaskIo 到達もゼロで返る。plan_move
        // 内にも同じ照合があるが、あちらは aggregate 単体で検証を完結させるための
        // 重複であり、md の内容には依存しない（md を使う再検証は status のみ）。
        index.ensure_to_column_order_matches(config, &intent)?;

        // revision/resource preflightはTaskIo readとcard-order metadata走査より先。
        let resources = state.preflight_session_write(snapshot)?;
        let original_bytes = io
            .read(&abs)
            .map_err(|error| MoveTaskCommandError::TaskIoRead(error.to_string()))?;
        let parsed = TaskDocument::parse(&original_bytes)
            .map_err(|error| MoveTaskCommandError::ParseFailed(error.to_string()))?
            .into_parsed();
        let scan_default_status = default_status_for(config);
        let outcome = index.plan_move(
            &intent,
            &existing,
            parsed,
            scan_default_status.as_str(),
            config,
        )?;

        match outcome {
            MoveTaskOutcome::SameColumn { existing_task } => {
                commit_same_column_move(SameColumnMove {
                    state,
                    io,
                    config_writer,
                    config_loader,
                    target_root: target.project_root(),
                    snapshot,
                    resources: &resources,
                    config,
                    intent: &intent,
                    existing_task,
                })
            }
            MoveTaskOutcome::CrossColumn {
                updated_task,
                file_content,
            } => commit_cross_column_move(CrossColumnMove {
                state,
                io,
                config_writer,
                config_loader,
                target_root: target.project_root(),
                snapshot,
                resources: &resources,
                config,
                intent: &intent,
                abs: &abs,
                original_bytes: &original_bytes,
                updated_task,
                file_content,
            }),
        }
    })
}

struct SameColumnMove<'a> {
    state: &'a AppState,
    io: &'a dyn TaskIo,
    config_writer: &'a dyn ConfigWriter,
    config_loader: &'a dyn Fn(&Path) -> Result<Config, LoadConfigError>,
    target_root: &'a crate::project::project_root::ProjectRoot,
    snapshot: &'a crate::project_session::ProjectSessionSnapshot,
    resources: &'a crate::state::SessionResourceAccess,
    config: &'a Config,
    intent: &'a MoveTaskIntent,
    existing_task: Task,
}

/// 同一column reorderをconfig writeと1 revision commitで確定する。
fn commit_same_column_move(args: SameColumnMove<'_>) -> Result<Task, MoveTaskCommandError> {
    let SameColumnMove {
        state,
        io,
        config_writer,
        config_loader,
        target_root,
        snapshot,
        resources,
        config,
        intent,
        existing_task,
    } = args;
    let next_config = plan_destination_card_order(
        config,
        io,
        target_root.as_path(),
        intent,
        existing_task.file_path().as_str(),
    )?;
    if &next_config == config {
        return Ok(existing_task);
    }

    let content = serde_json::to_string_pretty(&next_config)?;
    write_config_content(config_writer, target_root.as_path(), &content)?;
    commit_or_resync_under_lease(
        state,
        target_root,
        &snapshot.identity(),
        resources,
        &[],
        ResyncSource::ConfigAndTasks {
            task_io: io,
            load_config: config_loader,
        },
        "move_task",
        move |session| {
            session.replace_config(next_config);
            existing_task
        },
    )
}

struct CrossColumnMove<'a> {
    state: &'a AppState,
    io: &'a dyn TaskIo,
    config_writer: &'a dyn ConfigWriter,
    config_loader: &'a dyn Fn(&Path) -> Result<Config, LoadConfigError>,
    target_root: &'a crate::project::project_root::ProjectRoot,
    snapshot: &'a crate::project_session::ProjectSessionSnapshot,
    resources: &'a crate::state::SessionResourceAccess,
    config: &'a Config,
    intent: &'a MoveTaskIntent,
    abs: &'a Path,
    original_bytes: &'a [u8],
    updated_task: crate::task::task_index::ParsedTask,
    file_content: String,
}

/// cross-columnのtask/config planをI/O前に完成し、disk→aggregateの順に確定する。
fn commit_cross_column_move(args: CrossColumnMove<'_>) -> Result<Task, MoveTaskCommandError> {
    let CrossColumnMove {
        state,
        io,
        config_writer,
        config_loader,
        target_root,
        snapshot,
        resources,
        config,
        intent,
        abs,
        original_bytes,
        updated_task,
        file_content,
    } = args;
    let moved_file_path = updated_task.file_path.as_str();
    let next_config =
        plan_source_card_order(config, io, target_root.as_path(), intent, moved_file_path)?;
    let next_config = plan_destination_card_order(
        &next_config,
        io,
        target_root.as_path(),
        intent,
        moved_file_path,
    )?;
    let config_content = serde_json::to_string_pretty(&next_config)?;

    let moved_key = CanonicalTaskPath::from_path(&intent.file_path);
    if !snapshot.tasks().contains_key(&moved_key) {
        return Err(crate::task::move_task::error::MoveTaskError::TaskVanished {
            path: moved_key.as_str().to_string(),
        }
        .into());
    }
    let next_tasks = TaskIndex::new(snapshot.tasks().values().cloned().collect())
        .rebuild_with_external_change(crate::task::task_index::ExternalTaskChange::Upserted(
            Box::new(updated_task),
        ))?
        .tasks;
    let returned =
        next_tasks
            .get(&moved_key)
            .cloned()
            .ok_or_else(|| MoveTaskError::TaskVanished {
                path: moved_key.as_str().to_string(),
            })?;
    let registered_paths = vec![abs.to_path_buf()];
    resources.write_ignore().register(abs)?;
    if let Err(error) = io.write_existing(abs, file_content.as_bytes()) {
        cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
        return Err(MoveTaskCommandError::TaskIoWrite(error.to_string()));
    }
    if let Err(error) = write_config_content(config_writer, target_root.as_path(), &config_content)
    {
        // rollback failure must not skip marker cleanup or replace the original config error.
        let _ = io.write_existing(abs, original_bytes);
        cleanup_registered_write_ignores(resources.write_ignore(), &registered_paths);
        return Err(error);
    }

    commit_or_resync_under_lease(
        state,
        target_root,
        &snapshot.identity(),
        resources,
        &registered_paths,
        ResyncSource::ConfigAndTasks {
            task_io: io,
            load_config: config_loader,
        },
        "move_task",
        move |session| {
            session.replace_config(next_config);
            session.replace_tasks(next_tasks);
            returned
        },
    )
}

/// injected writerへ渡す前に既存config I/Oと同じsymlink拒否を行う。
fn write_config_content(
    writer: &dyn ConfigWriter,
    project_root: &Path,
    content: &str,
) -> Result<(), MoveTaskCommandError> {
    let config_path = config_io::config_path(project_root);
    let spec_board_dir = config_path
        .parent()
        .expect("config path always has .spec-board parent");
    reject_existing_symlink(spec_board_dir)?;
    reject_existing_symlink(&config_path)?;
    writer
        .write_atomic(&config_path, content)
        .map_err(|source| ConfigIoError::Io {
            path: config_path,
            source,
        })?;
    Ok(())
}

/// pathがexisting symlinkならconfig writeを拒否する。
fn reject_existing_symlink(path: &Path) -> Result<(), ConfigIoError> {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(ConfigIoError::Io {
            path: path.to_path_buf(),
            source: std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("{} is a symlink", path.display()),
            ),
        }),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(source) => Err(ConfigIoError::Io {
            path: path.to_path_buf(),
            source,
        }),
    }
}

/// `column_name` が `Config.columns` に存在することを確かめる。
fn ensure_column_exists(config: &Config, column_name: &str) -> Result<(), MoveTaskCommandError> {
    if config.has_column(column_name) {
        return Ok(());
    }
    Err(MoveTaskCommandError::UnknownColumn {
        column_name: column_name.to_string(),
    })
}

/// 移動先カラムの cardOrder を FE 指定順で上書きした `Config` を返す。
///
/// 指定並びに移動対象が含まれていなければ末尾に追加する。FE の算出漏れや stale な
/// 並びをそのまま保存すると、移動したタスクだけが移動先カラムの並びから抜け落ちる。
fn plan_destination_card_order(
    config: &Config,
    io: &dyn TaskIo,
    project_root: &Path,
    intent: &MoveTaskIntent,
    moved_file_path: &str,
) -> Result<Config, MoveTaskCommandError> {
    // 重複除去は CardOrder 型の不変条件が担うため、ここでは行わない。
    // canonical 化だけ先に済ませ、実在走査と cardOrder 保存で同じ表記を使う。
    let mut file_paths: Vec<String> = intent
        .to_column_file_paths
        .iter()
        .filter_map(|raw| CardOrder::canonical_path(raw))
        .map(TaskFilePath::into_string)
        .collect();
    // 移動対象も同じ canonical 化を通す。`file_paths` に raw 表記が 1 つでも混ざると
    // `collect_existing_paths` が作る実在集合と `plan_update_card_order` の canonical 表記が
    // 食い違い、移動したタスクが移動先の並びから落ちる。
    if let Some(moved) = CardOrder::canonical_path(moved_file_path) {
        if !file_paths.iter().any(|p| p == moved.as_str()) {
            file_paths.push(moved.into_string());
        }
    }
    let existing_paths = collect_existing_paths(io, project_root, &file_paths);
    config
        .plan_update_card_order(intent.to_column.clone(), file_paths, &existing_paths)
        .map_err(MoveTaskCommandError::from)
}

/// 移動元カラムの cardOrder から移動したタスクを取り除いた `Config` を返す。
///
/// 元エントリに対象パスが載っていない場合は書き換えない。載っていないカラムに
/// 空配列を挿入すると、FE が並びを持たないカラムにまで cardOrder が生えて
/// config.json が無意味に肥大化するため。
fn plan_source_card_order(
    config: &Config,
    io: &dyn TaskIo,
    project_root: &Path,
    intent: &MoveTaskIntent,
    moved_file_path: &str,
) -> Result<Config, MoveTaskCommandError> {
    let Some(current) = config.card_order.get(&intent.from_column) else {
        return Ok(config.clone());
    };
    let Some(moved) = CardOrder::canonical_path(moved_file_path) else {
        return Ok(config.clone());
    };
    if !current.contains(&moved) {
        return Ok(config.clone());
    }

    let retained: Vec<String> = current
        .iter()
        .filter(|p| *p != &moved)
        .map(|p| p.as_str().to_string())
        .collect();
    let existing_paths = collect_existing_paths(io, project_root, &retained);
    config
        .plan_update_card_order(intent.from_column.clone(), retained, &existing_paths)
        .map_err(MoveTaskCommandError::from)
}

/// `file_paths` のうち `project_root` 配下で「保持すべき」パスの集合を返す。
///
/// 各パスを `project_root.join(rel)` で解決し [`TaskIo::try_exists`] で判定する。
/// `Ok(false)` のみ除外対象（集合に入れない）とし、`permission denied` などの
/// I/O エラーは、ユーザーのカード並びを誤って失わないために保守的に集合へ含める。
fn collect_existing_paths(
    io: &dyn TaskIo,
    project_root: &Path,
    file_paths: &[String],
) -> HashSet<String> {
    file_paths
        .iter()
        .filter(|rel| io.try_exists(&project_root.join(rel)).unwrap_or(true))
        .cloned()
        .collect()
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
