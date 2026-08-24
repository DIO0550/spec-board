//! デバウンスウィンドウ 1 回分の畳み込み結果を表す値オブジェクト。

use std::path::PathBuf;

use super::core::WatcherFailure;

/// デバウンスウィンドウ 1 回分の畳み込み結果。
///
/// crate 内部の `PendingChanges` と専用 constructor だけが組み立て、
/// [`super::core::Watcher`] の receiver から上位層へ渡す。
///
/// - `removed` / `upserted` はウィンドウ終了時点のファイルシステム状態を表す
/// - 同一 path が両方に現れることはなく、各 `Vec` の中でも重複しない
/// - 順序は deadline 昇順（同点は path 昇順）で決定的
/// - `rescan` / `errors` は保留を追い越して送られる専用 batch でのみ立ち、
///   そのとき `removed` / `upserted` は空である
///
/// フィールドは外部から直接指定できない。
///
/// ```compile_fail,E0451
/// use spec_board_fs::watcher::file_change_batch::FileChangeBatch;
///
/// let _ = FileChangeBatch {
///     removed: Vec::new(),
///     upserted: Vec::new(),
///     rescan: false,
///     errors: Vec::new(),
/// };
/// ```
///
/// 空 batch も明示されたテスト用構築経路を通し、`Default` では作れない。
///
/// ```compile_fail,E0599
/// use spec_board_fs::watcher::file_change_batch::FileChangeBatch;
///
/// let _ = FileChangeBatch::default();
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChangeBatch {
    /// ウィンドウ終了時点で存在しない path。
    removed: Vec<PathBuf>,
    /// ウィンドウ終了時点で読み直すべき path。
    upserted: Vec<PathBuf>,
    /// backend がイベント取りこぼしを報告した。
    rescan: bool,
    /// 稼働中に発生したランタイム障害。
    errors: Vec<WatcherFailure>,
}

impl FileChangeBatch {
    /// 通常変更だけを伝える batch。
    pub(super) fn from_changes(removed: Vec<PathBuf>, upserted: Vec<PathBuf>) -> Self {
        debug_assert!(!removed.is_empty() || !upserted.is_empty());
        debug_assert!(paths_are_unique(&removed));
        debug_assert!(paths_are_unique(&upserted));
        debug_assert!(paths_are_disjoint(&removed, &upserted));
        Self {
            removed,
            upserted,
            rescan: false,
            errors: Vec::new(),
        }
    }

    /// backend がイベント取りこぼしを報告したことだけを伝える batch。
    pub(super) fn rescan() -> Self {
        Self {
            removed: Vec::new(),
            upserted: Vec::new(),
            rescan: true,
            errors: Vec::new(),
        }
    }

    /// 稼働中のランタイム障害 1 件だけを伝える batch。
    pub(super) fn from_failure(failure: WatcherFailure) -> Self {
        Self {
            removed: Vec::new(),
            upserted: Vec::new(),
            rescan: false,
            errors: vec![failure],
        }
    }

    /// ウィンドウ終了時点で存在しない path。
    pub fn removed(&self) -> &[PathBuf] {
        &self.removed
    }

    /// ウィンドウ終了時点で読み直すべき path。
    pub fn upserted(&self) -> &[PathBuf] {
        &self.upserted
    }

    /// backend がイベント取りこぼしを報告したか。
    pub fn is_rescan(&self) -> bool {
        self.rescan
    }

    /// 稼働中に発生したランタイム障害。
    pub fn errors(&self) -> &[WatcherFailure] {
        &self.errors
    }

    /// 伝えるべき変更が 1 件も無いか。
    pub fn is_empty(&self) -> bool {
        self.removed.is_empty()
            && self.upserted.is_empty()
            && !self.rescan
            && self.errors.is_empty()
    }
}

fn paths_are_unique(paths: &[PathBuf]) -> bool {
    paths
        .iter()
        .enumerate()
        .all(|(index, path)| !paths[index + 1..].contains(path))
}

fn paths_are_disjoint(removed: &[PathBuf], upserted: &[PathBuf]) -> bool {
    removed.iter().all(|path| !upserted.contains(path))
}

/// テストで相互排他的な batch mode を選ぶための builder。
#[cfg(any(test, feature = "test-utils"))]
pub struct FileChangeBatchTestBuilder {
    batch: FileChangeBatch,
}

#[cfg(any(test, feature = "test-utils"))]
impl FileChangeBatchTestBuilder {
    /// 空 batch mode。
    pub fn empty() -> Self {
        Self {
            batch: FileChangeBatch {
                removed: Vec::new(),
                upserted: Vec::new(),
                rescan: false,
                errors: Vec::new(),
            },
        }
    }

    /// 通常変更 batch mode。
    pub fn changes(removed: Vec<PathBuf>, upserted: Vec<PathBuf>) -> Self {
        assert!(
            !removed.is_empty() || !upserted.is_empty(),
            "changes mode must contain at least one path"
        );
        assert!(paths_are_unique(&removed), "removed paths must be unique");
        assert!(paths_are_unique(&upserted), "upserted paths must be unique");
        assert!(
            paths_are_disjoint(&removed, &upserted),
            "removed and upserted paths must be disjoint"
        );
        Self {
            batch: FileChangeBatch::from_changes(removed, upserted),
        }
    }

    /// rescan batch mode。
    pub fn rescan() -> Self {
        Self {
            batch: FileChangeBatch::rescan(),
        }
    }

    /// runtime failure batch mode。
    pub fn failure(failure: WatcherFailure) -> Self {
        Self {
            batch: FileChangeBatch::from_failure(failure),
        }
    }

    /// 選択済み mode の batch を返す。
    pub fn build(self) -> FileChangeBatch {
        self.batch
    }
}

#[cfg(test)]
#[path = "file_change_batch_tests.rs"]
mod file_change_batch_tests;
