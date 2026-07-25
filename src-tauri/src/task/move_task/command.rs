//! `move_task` Tauri command と effect 層実装。
//!
//! カラム間移動（status 変更 + cardOrder 更新）と同一カラム並び替え（cardOrder のみ）を
//! 単一 command で処理する。FE 側で二段 IPC を行うと、片方だけ成功した中間状態
//! （旧 partial-move）が観測できてしまうため、両方の書き込みをここに閉じ込める。
//!
//! # ロック取得順序
//!
//! `AppState` の lock 契約 `project_path → config → tasks_cache → watcher_handle →
//! write_ignore` に従う。`snapshot_project_and_config` で前半 2 つを同時保持して
//! snapshot し、その後 `tasks_snapshot` → `write_ignore` の順に進む。
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

use spec_board_fs::config::config_io::write_config_json;
use tauri::State;

use crate::config::Config;
use crate::state::AppState;
use crate::task::frontmatter;
use crate::task::io::{FsTaskIo, TaskIo};
use crate::task::move_task::args::MoveTaskArgs;
use crate::task::move_task::error::MoveTaskCommandError;
use crate::task::parse::default_status_for;
use crate::task::task_index::{MoveTaskIntent, MoveTaskOutcome, Task, TaskIndex};

/// `move_task` Tauri command 薄層。
#[tauri::command]
pub fn move_task(state: State<'_, Arc<AppState>>, args: MoveTaskArgs) -> Result<Task, String> {
    move_task_impl(state.inner().as_ref(), &FsTaskIo, args).map_err(|e| e.to_string())
}

/// effect 層本体（テスト境界）。
pub(crate) fn move_task_impl(
    state: &AppState,
    io: &dyn TaskIo,
    args: MoveTaskArgs,
) -> Result<Task, MoveTaskCommandError> {
    // `project_path` と `config` を atomic に snapshot して、`open_project` の
    // 両者更新の間に割り込んで「新 path + 旧 config」を観測する race を防ぐ。
    let (project_root, config) = state.snapshot_project_and_config()?;
    let project_root = project_root.ok_or(MoveTaskCommandError::NoProjectOpen)?;
    let config = config.ok_or(MoveTaskCommandError::NoProjectOpen)?;

    let intent = args.into_intent(project_root.as_path())?;
    ensure_column_exists(&config, &intent.from_column)?;
    ensure_column_exists(&config, &intent.to_column)?;

    let rel_path = intent.file_path.clone();
    let abs = project_root.join(&rel_path);

    // cache 全体を clone すると DnD 1 回ごとに全 task の本文までコピーすることになる。
    // 対象 1 件だけを lock 内で引き当てて clone する。
    let existing = state
        .with_tasks_cache(|cache| TaskIndex::find_in_cache(cache, rel_path.as_path()).cloned())?
        .ok_or_else(|| MoveTaskCommandError::TaskNotFound {
            path: rel_path.to_string_lossy().into_owned(),
        })?;

    // 同一カラム並び替えでも md を読むのは、status 一致検証と cross/same 判定の
    // 両方を aggregate (`plan_move`) に委ねているため。effect 層側で from == to を
    // 先に判定して読み飛ばすと、stale な status のまま cardOrder だけが書き換わる。
    let original_bytes = io
        .read(&abs)
        .map_err(|e| MoveTaskCommandError::TaskIoRead(e.to_string()))?;
    let parsed = frontmatter::parse_bytes(&original_bytes)
        .map_err(|e| MoveTaskCommandError::ParseFailed(e.to_string()))?
        .ok_or_else(|| {
            MoveTaskCommandError::ParseFailed("no frontmatter delimiter found".to_string())
        })?;

    // `plan_move` は移動対象 1 件の不変条件だけを見る（`plan_update` の parent 階層検証と
    // 違って兄弟 task を参照しない）ため、aggregate は対象 1 件から組み立てる。
    let index = TaskIndex::new(vec![existing.clone()]);
    // md の `status:` が欠落 / 非文字列のときの実効 status は scan 時と同じ既定値になる。
    // 既定値の決定は Config のドメインなので effect 層で解決し、値だけを aggregate に渡す。
    let scan_default_status = default_status_for(&config);
    let outcome = index.plan_move(&intent, &existing, parsed, scan_default_status.as_str())?;

    match outcome {
        MoveTaskOutcome::SameColumn { existing_task } => {
            let next_config = plan_destination_card_order(
                &config,
                &project_root,
                &intent,
                existing.file_path.as_str(),
            )?;
            write_and_commit_config(state, &project_root, next_config)?;
            Ok(existing_task)
        }
        MoveTaskOutcome::CrossColumn {
            updated_task,
            file_content,
        } => {
            let watcher_active = state.is_watcher_installed()?;
            if watcher_active {
                state.write_ignore().register(&abs)?;
            }

            if let Err(err) = io.write_existing(&abs, file_content.as_bytes()) {
                if watcher_active {
                    let _ = state.write_ignore().unregister(&abs);
                }
                return Err(MoveTaskCommandError::TaskIoWrite(err.to_string()));
            }

            // md 書き込み以降の失敗はすべて rollback 経路へ流す必要があるため、
            // cardOrder の計算・config 書き込み・cache commit を 1 本の Result に
            // 畳んでから分岐する。
            let commit_result = commit_cross_column(CrossColumnCommit {
                state,
                project_root: &project_root,
                config: &config,
                intent: &intent,
                updated_task: &updated_task,
            });

            match commit_result {
                Ok(task) => Ok(task),
                Err(err) => {
                    // task md だけが新 status で残ると、config の cardOrder と disk が
                    // 食い違ったまま再収束の手がかりが無くなる。書き戻しに失敗しても
                    // watcher / 再スキャンでの収束に委ね、元の失敗理由を返す。
                    let _ = io.write_existing(&abs, &original_bytes);
                    if watcher_active {
                        let _ = state.write_ignore().unregister(&abs);
                    }
                    Err(err)
                }
            }
        }
    }
}

/// `commit_cross_column` の引数。effect 層の局所的な束ねで、公開はしない。
struct CrossColumnCommit<'a> {
    state: &'a AppState,
    project_root: &'a Path,
    config: &'a Config,
    intent: &'a MoveTaskIntent,
    updated_task: &'a Task,
}

/// カラム間移動の cardOrder 計算 → `config.json` 書き込み → in-memory commit を行う。
///
/// `config` の差し替えと tasks キャッシュ更新は
/// `replace_config_and_tasks_if_project_matches` で**同一クリティカルセクション**に入れる。
/// 2 段に分けると、その間に `open_project` が完了して旧プロジェクト由来の `Task` を
/// 新プロジェクトのキャッシュへ挿入してしまう。
///
/// project が切り替わっていた場合（`None`）は in-memory を一切変更せず、計画済みの
/// `Task` をそのまま返す。disk 書き込みは旧プロジェクト視点では整合的に完了しており、
/// FE 側は version guard でこの応答を破棄する。
///
/// cache commit が失敗した場合（並行削除で対象が消えていた等）は、既に書き終えている
/// `config.json` を移動前の内容へ書き戻す。呼び出し側が task md を書き戻すのと合わせて、
/// disk 上を移動前の状態へ揃えるため（`config.json` だけ移動後に進むと、FE の全面
/// rollback と永続状態が食い違う）。
fn commit_cross_column(args: CrossColumnCommit<'_>) -> Result<Task, MoveTaskCommandError> {
    let CrossColumnCommit {
        state,
        project_root,
        config,
        intent,
        updated_task,
    } = args;
    let moved_file_path = updated_task.file_path.as_str();

    let next_config = plan_source_card_order(config, project_root, intent, moved_file_path)?;
    let next_config =
        plan_destination_card_order(&next_config, project_root, intent, moved_file_path)?;

    let json = serde_json::to_string_pretty(&next_config)?;
    write_config_json(project_root, &json)?;

    let committed =
        state.replace_config_and_tasks_if_project_matches(project_root, next_config, |cache| {
            TaskIndex::commit_move_into_cache(cache, &intent.file_path, updated_task)
        })?;

    match committed {
        Some(Ok(task)) => Ok(task),
        Some(Err(err)) => {
            restore_config_json_best_effort(project_root, config);
            Err(MoveTaskCommandError::from(err))
        }
        None => Ok(updated_task.clone()),
    }
}

/// 移動前の `config` を `config.json` へ書き戻す。失敗しても元のエラーを潰さない。
///
/// 書き戻せなかった場合の再収束は、task md の best-effort rollback と同じく
/// watcher / 再スキャンに委ねる。
fn restore_config_json_best_effort(project_root: &Path, config: &Config) {
    let Ok(json) = serde_json::to_string_pretty(config) else {
        return;
    };
    let _ = write_config_json(project_root, &json);
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
/// 重複を除いた上で、指定並びに移動対象が含まれていなければ末尾に追加する。FE の
/// 算出漏れや stale な並びをそのまま保存すると、移動したタスクだけが移動先カラムの
/// 並びから抜け落ちる / 同じカードが 2 回並ぶ。
fn plan_destination_card_order(
    config: &Config,
    project_root: &Path,
    intent: &MoveTaskIntent,
    moved_file_path: &str,
) -> Result<Config, MoveTaskCommandError> {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut file_paths: Vec<String> = intent
        .to_column_file_paths
        .iter()
        .filter(|p| seen.insert(p.as_str()))
        .cloned()
        .collect();
    if !file_paths.iter().any(|p| p == moved_file_path) {
        file_paths.push(moved_file_path.to_string());
    }
    let existing_paths = collect_existing_paths(project_root, &file_paths);
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
    project_root: &Path,
    intent: &MoveTaskIntent,
    moved_file_path: &str,
) -> Result<Config, MoveTaskCommandError> {
    let Some(current) = config.card_order.get(&intent.from_column) else {
        return Ok(config.clone());
    };
    if !current.iter().any(|p| p == moved_file_path) {
        return Ok(config.clone());
    }

    let retained: Vec<String> = current
        .iter()
        .filter(|p| p.as_str() != moved_file_path)
        .cloned()
        .collect();
    let existing_paths = collect_existing_paths(project_root, &retained);
    config
        .plan_update_card_order(intent.from_column.clone(), retained, &existing_paths)
        .map_err(MoveTaskCommandError::from)
}

/// `config.json` へ書き出し、成功した場合のみ in-memory `Config` を更新する。
///
/// 同一カラム並び替え用。tasks キャッシュは変更しないため、`project_path` の照合は
/// `replace_config_if_project_matches` の check-and-set だけで足りる。
fn write_and_commit_config(
    state: &AppState,
    project_root: &Path,
    config: Config,
) -> Result<(), MoveTaskCommandError> {
    let json = serde_json::to_string_pretty(&config)?;
    write_config_json(project_root, &json)?;
    state.replace_config_if_project_matches(project_root, config)?;
    Ok(())
}

/// `file_paths` のうち `project_root` 配下で「保持すべき」パスの集合を返す。
///
/// 各パスを `project_root.join(rel)` で解決し `std::fs::metadata` で判定する。
/// `Err(NotFound)` のみ除外対象（集合に入れない）とし、`permission denied` など
/// 他の I/O エラーは、ユーザーのカード並びを誤って失わないために保守的に集合へ含める。
fn collect_existing_paths(project_root: &Path, file_paths: &[String]) -> HashSet<String> {
    file_paths
        .iter()
        .filter(|rel| match std::fs::metadata(project_root.join(rel)) {
            Ok(_) => true,
            Err(e) => e.kind() != ErrorKind::NotFound,
        })
        .cloned()
        .collect()
}

#[cfg(test)]
#[path = "command_tests.rs"]
mod command_tests;
