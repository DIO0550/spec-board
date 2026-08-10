//! デバウンスウィンドウ 1 回分の畳み込み結果を表す値オブジェクト。

use std::path::PathBuf;

use super::core::WatcherFailure;

/// デバウンスウィンドウ 1 回分の畳み込み結果。
///
/// 以下は crate 内部の `PendingChanges` が組み立てた batch —— すなわち
/// [`super::core::Watcher`] の receiver から受け取ったもの —— についてのみ
/// 成立する契約である。フィールドはすべて `pub` で `Default` も導出して
/// いるため、呼び出し側が値を直接組み立てれば当然どれも破れる。テスト以外
/// で自前構築しないこと。
///
/// - `removed` / `upserted` はウィンドウ終了時点のファイルシステム状態を表す
/// - 同一 path が両方に現れることはなく、各 `Vec` の中でも重複しない
/// - 順序は deadline 昇順（同点は path 昇順）で決定的
/// - `rescan` / `errors` は保留を追い越して送られる専用 batch でのみ立ち、
///   そのとき `removed` / `upserted` は空である
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct FileChangeBatch {
    /// ウィンドウ終了時点で存在しない path。
    pub removed: Vec<PathBuf>,
    /// ウィンドウ終了時点で読み直すべき path。
    pub upserted: Vec<PathBuf>,
    /// backend がイベント取りこぼしを報告した。
    pub rescan: bool,
    /// 稼働中に発生したランタイム障害。
    pub errors: Vec<WatcherFailure>,
}

impl FileChangeBatch {
    /// backend がイベント取りこぼしを報告したことだけを伝える batch。
    pub(crate) fn rescan() -> Self {
        Self {
            rescan: true,
            ..Self::default()
        }
    }

    /// 稼働中のランタイム障害 1 件だけを伝える batch。
    pub(crate) fn from_failure(failure: WatcherFailure) -> Self {
        Self {
            errors: vec![failure],
            ..Self::default()
        }
    }

    /// 伝えるべき変更が 1 件も無いか。
    pub fn is_empty(&self) -> bool {
        self.removed.is_empty()
            && self.upserted.is_empty()
            && !self.rescan
            && self.errors.is_empty()
    }
}

#[cfg(test)]
#[path = "file_change_batch_tests.rs"]
mod file_change_batch_tests;
