//! `move_task` のエラー型。
//!
//! FE 側 `TauriError.PATTERNS` が Display 文字列を正規表現でマッチして
//! `TauriErrorCode` に分類するため、`update_card_order` 由来の日本語文言を踏襲する
//! （「見つかりません」→ NOT_FOUND / 「書き込み」→ IO_ERROR /
//! 「フロントマター」→ PARSE_ERROR）。文言を変えると FE の分類が変わる。

use thiserror::Error;

use crate::config::UpdateCardOrderPlanError;
use crate::project_session::{RevisionExhausted, SessionConflict};
use crate::state::{AppStateError, SessionResourceConflict, SessionWriteError};
use crate::task::create::error::ContentRejectReason;
use crate::task::parse::TaskParseError;
use crate::task::task_content::TaskContentError;
use spec_board_fs::config::config_io::ConfigIoError;
use spec_board_fs::watcher::write_ignore::WriteIgnoreError;

/// aggregate method `TaskIndex::plan_move` の検証エラー。
///
/// `plan_move` は effect 層が引き当て済みの `existing: &Task` を受け取るため、
/// 「タスクが見つからない」系はここに含めず command 層のエラーで表現する。
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum MoveTaskError {
    /// 移動元カラムとして指定された status が、実際の task の status と一致しない。
    /// 別ウィンドウ・別操作で status が変更済みの stale な移動を弾く。
    #[error("タスクの状態が変わっています: 期待={expected}, 実際={actual}")]
    StatusMismatch { expected: String, actual: String },

    /// 移動先カラムの並びが、FE が前提にしていたものと食い違う。
    /// 別ウィンドウ・外部エディタ・watcher 経由の変更が先に入っている状態を弾く。
    ///
    /// `expected` / `actual` はテストが「何と何が食い違ったか」を主張するために保持
    /// する。Display には件数だけを出す（並び全体を文字列化するとトーストが読めない
    /// 長さになる）。「並びが変わっています」は FE の分類パターンが CONFLICT を
    /// 引き当てる鍵なので、文言を変えるときは FE 側のパターンも同時に変える。
    #[error("移動先カラムの並びが変わっています: {column}（期待={}件, 実際={}件）", .expected.len(), .actual.len())]
    CardOrderConflict {
        column: String,
        expected: Vec<String>,
        actual: Vec<String>,
    },

    /// 書き換え後の内容が scanner の受理条件（サイズ / バイナリ判定）を満たさない。
    /// 書き込んでしまうと移動は成功したのに次の再スキャンで task が消える。
    #[error("タスクの内容がスキャン対象の条件を満たしません: {reason}")]
    ContentNotScannerEligible { reason: ContentRejectReason },
    #[error("task document render failed: {0}")]
    DocumentRender(String),

    /// cache commit 時点で対象タスクが cache から消えていた（並行削除 / 再 scan）。
    #[error("対象のタスクが見つかりません: {path}")]
    TaskVanished { path: String },
}

impl From<TaskContentError> for MoveTaskError {
    fn from(err: TaskContentError) -> Self {
        let reason = match err {
            TaskContentError::TooLarge { size, .. } => ContentRejectReason::TooLarge { size },
            TaskContentError::BinaryDetected { .. } => ContentRejectReason::BinaryDetected,
        };
        Self::ContentNotScannerEligible { reason }
    }
}

/// `move_task_impl`（effect 層）全体のエラー。
///
/// `ConfigIoError` / `serde_json::Error` が `std::io::Error` 等を内包するため
/// `PartialEq` は derive しない。テストは `matches!` でバリアントを判定する。
#[derive(Debug, Error)]
pub enum MoveTaskCommandError {
    #[error(transparent)]
    Validation(#[from] MoveTaskError),

    #[error("プロジェクトが開かれていません")]
    NoProjectOpen,

    #[error("対象のタスクが見つかりません: {path}")]
    TaskNotFound { path: String },

    #[error("カラムが見つかりません: {column_name}")]
    UnknownColumn { column_name: String },

    #[error("ファイルパスが不正です: {0}")]
    InvalidPath(String),

    #[error("内部状態のロックが破損しました")]
    StateLockPoisoned,

    #[error(transparent)]
    WriteIgnore(#[from] WriteIgnoreError),

    #[error("タスクファイルの読み込みに失敗しました: {0}")]
    TaskIoRead(String),

    #[error("タスクファイルの書き込みに失敗しました: {0}")]
    TaskIoWrite(String),

    #[error("フロントマターの解析に失敗しました: {0}")]
    ParseFailed(String),

    #[error("config.json の書き込みに失敗しました: {0}")]
    ConfigIo(#[from] ConfigIoError),

    #[error("config.json のシリアライズに失敗しました: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error(transparent)]
    SessionConflict(#[from] SessionConflict),

    #[error(transparent)]
    RevisionExhausted(#[from] RevisionExhausted),

    #[error(transparent)]
    ResourceConflict(#[from] SessionResourceConflict),

    #[error(transparent)]
    Resolution(#[from] TaskParseError),
}

impl From<SessionWriteError> for MoveTaskCommandError {
    fn from(error: SessionWriteError) -> Self {
        match error {
            SessionWriteError::NoProjectOpen => Self::NoProjectOpen,
            SessionWriteError::State(_) => Self::StateLockPoisoned,
            SessionWriteError::Conflict(error) => Self::SessionConflict(error),
            SessionWriteError::RevisionExhausted(error) => Self::RevisionExhausted(error),
            SessionWriteError::ResourceConflict(error) => Self::ResourceConflict(error),
        }
    }
}

impl From<AppStateError> for MoveTaskCommandError {
    fn from(_: AppStateError) -> Self {
        Self::StateLockPoisoned
    }
}

impl From<UpdateCardOrderPlanError> for MoveTaskCommandError {
    fn from(err: UpdateCardOrderPlanError) -> Self {
        match err {
            UpdateCardOrderPlanError::UnknownColumn { column_name } => {
                Self::UnknownColumn { column_name }
            }
        }
    }
}
