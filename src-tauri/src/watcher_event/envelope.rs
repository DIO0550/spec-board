//! watcher 由来 Tauri event の共通外枠（envelope）。
//!
//! `spec-board-fs` は tauri 非依存のため、IPC の serde 型は本体クレート側に置く。
//! すべて `#[serde(rename_all = "camelCase")]`（IPC DTO 規約）。
//!
//! # revision / eventSeq / cacheMutating の役割分担
//!
//! - `revision`: `tasks_cache` の版。`get_tasks` 応答の revision と比較して
//!   「この event は snapshot より新しいか」を判定する。emit を伴わない mutation
//!   でも進むため、連番の欠落判定には使えない。
//! - `eventSeq`: emit 1 回につき 1 つ消費する連番。欠番は取りこぼしを意味する。
//!   **emit に失敗しても消費する**ことで、FE の gap 検知 → 自動再取得へ倒す。
//! - `cacheMutating`: この envelope が `tasks_cache` を変更したか。**false の
//!   envelope に revision の単調性を要求してはならない**。診断は cache を変えないので
//!   revision が FE の lastRevision と等しくなり、単調性を要求すると通知が構造的に
//!   1 度も届かなくなる。

use serde::{Deserialize, Serialize};

use crate::state::change_id::ChangeId;
use crate::state::event_seq::EventSeq;
use crate::state::project_generation::ProjectGeneration;
use crate::state::project_key::ProjectKey;
use crate::state::tasks_revision::TasksRevision;
use crate::task::payload::TaskPayload;

/// event 名の定数。FE と共有する外部契約なので 1 箇所に集約する。
pub(crate) const EVENT_TASK_CREATED: &str = "task-created";
pub(crate) const EVENT_TASK_UPDATED: &str = "task-updated";
pub(crate) const EVENT_TASK_DELETED: &str = "task-deleted";
pub(crate) const EVENT_RESYNC_REQUIRED: &str = "watcher-resync-required";
pub(crate) const EVENT_DIAGNOSTIC: &str = "watcher-diagnostic";

/// payload 型ごとに「cache を変更するイベントか」を固定する trait。
///
/// `cache_mutating` を呼び出し側の生 bool にすると、cache 変更イベントに誤って
/// `false` を渡したときに **FE 側の revision ガードが丸ごと無効化される** —
/// 追い越した古いイベントが board を巻き戻すのに、型でもテストでも検出できない。
/// payload 型に紐づけて導出することで、呼び出し側が指定する余地を無くす。
pub(crate) trait EnvelopePayload {
    /// この payload を載せた envelope が `tasks_cache` を変更したか。
    const CACHE_MUTATING: bool;
}

/// 全 watcher event 共通の外枠。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(Deserialize))]
#[serde(rename_all = "camelCase")]
pub(crate) struct WatcherEnvelope<P> {
    pub(crate) project_key: ProjectKey,
    pub(crate) generation: ProjectGeneration,
    pub(crate) revision: TasksRevision,
    /// この envelope が `tasks_cache` を変更したか。FE の単調性判定の適用条件。
    pub(crate) cache_mutating: bool,
    pub(crate) event_seq: EventSeq,
    /// ログ相関用の ID（順序判定には使わない）。
    pub(crate) change_id: ChangeId,
    pub(crate) payload: P,
}

/// `task-created` / `task-updated` の payload。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[cfg_attr(test, derive(Deserialize))]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskUpsertPayload {
    pub(crate) task: TaskPayload,
}

/// `task-deleted` の payload。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TaskDeletedPayload {
    pub(crate) file_path: String,
}

/// `watcher-resync-required` の payload。**snapshot は同梱しない**。
///
/// 全 task を載せると 1 event が数 MB になる（`Task.body` は Markdown 全文）。
/// FE は既存の `get_tasks` で取り直す。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResyncRequiredPayload {
    pub(crate) reason: ResyncReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ResyncReason {
    /// backend の Rescan 通知を受けて full rescan を完了した。
    Rescan,
}

/// `watcher-diagnostic` の payload。`cache_mutating = false` で emit する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DiagnosticPayload {
    pub(crate) code: DiagnosticCode,
    pub(crate) message: String,
    pub(crate) paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DiagnosticCode {
    WatchPathUnavailable,
    ResourceExhausted,
    PermissionDenied,
    Io,
    Unknown,
    /// full rescan 自体に失敗した（cache は変更していない）。
    RescanFailed,
}

impl EnvelopePayload for TaskUpsertPayload {
    const CACHE_MUTATING: bool = true;
}

impl EnvelopePayload for TaskDeletedPayload {
    const CACHE_MUTATING: bool = true;
}

impl EnvelopePayload for ResyncRequiredPayload {
    const CACHE_MUTATING: bool = true;
}

impl EnvelopePayload for DiagnosticPayload {
    const CACHE_MUTATING: bool = false;
}

/// envelope を組み立てる。
///
/// `change_id` は `(generation, eventSeq)` から、`cache_mutating` は
/// `P::CACHE_MUTATING` から導出する（どちらも引数では受け取らない）。
pub(crate) fn build_envelope<P: EnvelopePayload>(
    project_key: &ProjectKey,
    generation: ProjectGeneration,
    revision: TasksRevision,
    event_seq: EventSeq,
    payload: P,
) -> WatcherEnvelope<P> {
    WatcherEnvelope {
        project_key: project_key.clone(),
        generation,
        revision,
        cache_mutating: P::CACHE_MUTATING,
        event_seq,
        change_id: ChangeId::compose(generation, event_seq),
        payload,
    }
}

#[cfg(test)]
#[path = "envelope_tests.rs"]
mod envelope_tests;
