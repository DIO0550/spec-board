//! disk write後のsession conflictを同じwrite lease内で復旧する共通処理。

use std::collections::HashMap;
use std::path::Path;

use thiserror::Error;

use crate::config::{
    Config, LabelRegistry, LabelRegistryStore, LoadConfigError, LoadLabelsError,
    LoadMilestonesError, MilestoneRegistry, MilestoneRegistryStore,
};
use crate::project::load_warning::{deduplicate_and_sort, ProjectLoadWarningStage};
use crate::project::project_root::ProjectRoot;
use crate::project_session::{ProjectSession, ProjectSessionSnapshot, SessionConflict};
use crate::state::{AppState, AppStateError, SessionWriteError};
use crate::task::canonical_task_path::CanonicalTaskPath;
use crate::task::io::TaskIo;
use crate::task::parse::default_status_for;
use crate::task::rebuild::RebuildTasksError;
use crate::task::task_index::Task;

/// same-session resyncが完了しなかった理由。
#[derive(Debug, Error)]
pub(crate) enum ResyncError {
    /// current sessionを読み取れない。
    #[error(transparent)]
    State(#[from] AppStateError),
    /// conflictがlease中の同一sessionを指していない。
    #[error(transparent)]
    Session(#[from] SessionConflict),
    /// configの再読み込みに失敗した。
    #[error(transparent)]
    Config(#[from] LoadConfigError),
    /// label registryの再読み込みに失敗した。
    #[error(transparent)]
    Labels(#[from] LoadLabelsError),
    /// milestone registryの再読み込みに失敗した。
    #[error(transparent)]
    Milestones(#[from] LoadMilestonesError),
    /// taskの再構築に失敗した。
    #[error(transparent)]
    Tasks(#[from] RebuildTasksError),
    /// diskから読み込んだ値のresident commitに失敗した。
    #[error(transparent)]
    Commit(#[from] SessionWriteError),
}

/// conflictしたoperationがdiskから再同期するaggregate field。
pub(crate) enum ResyncSource<'a> {
    /// task filesだけを再構築する。
    Tasks { task_io: &'a dyn TaskIo },
    /// configと、そのconfigを既定値に使うtask filesを再構築する。
    ConfigAndTasks {
        task_io: &'a dyn TaskIo,
        load_config: &'a dyn Fn(&Path) -> Result<Config, LoadConfigError>,
    },
    /// label registryを再読み込みする。
    Labels { store: &'a dyn LabelRegistryStore },
    /// milestone registryを再読み込みする。
    Milestones {
        store: &'a dyn MilestoneRegistryStore,
    },
}

/// I/O完了後に1回のaggregate commitで反映する復旧値。
enum RecoveredAggregate {
    Tasks {
        tasks: HashMap<CanonicalTaskPath, Task>,
        load_warnings: Vec<crate::project::load_warning::ProjectLoadWarning>,
    },
    ConfigAndTasks {
        config: Config,
        tasks: HashMap<CanonicalTaskPath, Task>,
        load_warnings: Vec<crate::project::load_warning::ProjectLoadWarning>,
    },
    Labels(LabelRegistry),
    Milestones(MilestoneRegistry),
}

impl RecoveredAggregate {
    /// 事前構築済みの復旧値を失敗しないresident mutationとして適用する。
    fn apply(self, session: &mut ProjectSession) {
        match self {
            Self::Tasks {
                tasks,
                load_warnings,
            } => session.replace_tasks_and_load_warnings(tasks, load_warnings),
            Self::ConfigAndTasks {
                config,
                tasks,
                load_warnings,
            } => {
                session.replace_config(config);
                session.replace_tasks_and_load_warnings(tasks, load_warnings);
            }
            Self::Labels(labels) => session.replace_labels(labels),
            Self::Milestones(milestones) => session.replace_milestones(milestones),
        }
    }
}

/// task一覧をaggregateが保持するrelative path mapへ変換する。
fn tasks_by_path(tasks: Vec<Task>) -> HashMap<CanonicalTaskPath, Task> {
    tasks
        .into_iter()
        .map(|task| (CanonicalTaskPath::from_file_path(&task.file_path), task))
        .collect()
}

fn merge_task_load_warnings(
    snapshot: &ProjectSessionSnapshot,
    warnings: Vec<crate::project::load_warning::ProjectLoadWarning>,
) -> Vec<crate::project::load_warning::ProjectLoadWarning> {
    let mut merged = snapshot
        .load_warnings()
        .iter()
        .filter(|warning| warning.stage == ProjectLoadWarningStage::Config)
        .cloned()
        .collect::<Vec<_>>();
    merged.extend(warnings);
    deduplicate_and_sort(merged)
}

/// callerが保持するexact-root write lease内でsame-session stateを再同期する。
pub(crate) fn resync_if_same_project_under_lease(
    state: &AppState,
    lease_root: &ProjectRoot,
    conflict: &SessionConflict,
    source: ResyncSource<'_>,
) -> Result<(), ResyncError> {
    let snapshot = validate_recovery_scope(state, lease_root, conflict)?;
    state.preflight_session_write(&snapshot)?;
    let recovered = load_recovered_aggregate(&snapshot, source)?;
    state.commit_session_write(&snapshot.identity(), move |session| {
        recovered.apply(session);
    })?;

    Ok(())
}

/// conflict、lease、current snapshotが同じopen sessionを指すことをI/O前に検証する。
fn validate_recovery_scope(
    state: &AppState,
    lease_root: &ProjectRoot,
    conflict: &SessionConflict,
) -> Result<ProjectSessionSnapshot, ResyncError> {
    let Some(actual) = conflict.actual.as_ref() else {
        return Err(conflict.clone().into());
    };
    let expected_matches_lease = conflict.expected.project_root() == lease_root;
    let actual_matches_lease = actual.project_root() == lease_root;
    if !expected_matches_lease
        || !actual_matches_lease
        || !conflict.expected.is_same_session(actual)
    {
        return Err(conflict.clone().into());
    }

    let snapshot = state.require_session_snapshot()?;
    snapshot.ensure_same_session(actual)?;
    Ok(snapshot)
}

/// operationに必要なfieldをdiskから読み、未commitの復旧値としてまとめる。
fn load_recovered_aggregate(
    snapshot: &ProjectSessionSnapshot,
    source: ResyncSource<'_>,
) -> Result<RecoveredAggregate, ResyncError> {
    let root = snapshot.project_root().as_path();
    match source {
        ResyncSource::Tasks { task_io } => {
            let default_status = default_status_for(snapshot.config());
            let report = crate::task::rebuild::rebuild_tasks_from_disk_with_report(
                root,
                &default_status,
                task_io,
            )?;
            Ok(RecoveredAggregate::Tasks {
                tasks: tasks_by_path(report.tasks),
                load_warnings: merge_task_load_warnings(snapshot, report.warnings),
            })
        }
        ResyncSource::ConfigAndTasks {
            task_io,
            load_config,
        } => {
            let config = load_config(root)?;
            let default_status = default_status_for(&config);
            let report = crate::task::rebuild::rebuild_tasks_from_disk_with_report(
                root,
                &default_status,
                task_io,
            )?;
            Ok(RecoveredAggregate::ConfigAndTasks {
                config,
                tasks: tasks_by_path(report.tasks),
                load_warnings: deduplicate_and_sort(report.warnings),
            })
        }
        ResyncSource::Labels { store } => Ok(RecoveredAggregate::Labels(store.load()?)),
        ResyncSource::Milestones { store } => Ok(RecoveredAggregate::Milestones(store.load()?)),
    }
}

#[cfg(test)]
#[path = "conflict_recovery_tests.rs"]
mod conflict_recovery_tests;
