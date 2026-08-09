//! デバウンス中の保留状態と、path ごとの畳み込みルールを所有する aggregate。

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use super::core::{FsEvent, DEBOUNCE_DURATION};
use super::file_change_batch::FileChangeBatch;

/// ウィンドウ終了時点で path が取るべき最終状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PathChange {
    /// 読み込み直して上位層へ反映すべき（作成 / 変更 / rename 先）。
    Upserted,
    /// 上位層から取り除くべき（削除 / rename 元）。
    Removed,
    /// 作成とも削除とも判定できない。flush 時に実在で決める。
    Unresolved,
}

/// 保留中の 1 path 分のエントリ。
struct PendingEntry {
    change: PathChange,
    deadline: Instant,
}

/// デバウンス中の保留状態。アダプタスレッド固有の可変状態で、複数スレッドから
/// 共有されない。
///
/// 不変条件: 1 つの path につきエントリはちょうど 1 つ。新しいイベントは状態を
/// 後勝ちで置換し、deadline を `now + DEBOUNCE_DURATION` へ延長する。
pub(crate) struct PendingChanges {
    entries: HashMap<PathBuf, PendingEntry>,
}

impl PendingChanges {
    pub(crate) fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// 1 件の通常イベントを畳み込む。
    ///
    /// `Renamed` だけは from / to の 2 エントリを登録する。単一の宛先キーへ
    /// まとめると、後続の `Modified(to)` が rename ごと上書きして rename 元の
    /// 削除が永久に失われる。
    ///
    /// `Rescan` / `Error` は呼び出し側でバイパスされる前提で、本 method には
    /// 届かないことを `debug_assert!` で守る。
    pub(crate) fn record(&mut self, event: &FsEvent, now: Instant) {
        debug_assert!(!matches!(event, FsEvent::Rescan | FsEvent::Error(_)));
        match event {
            FsEvent::Created(path) | FsEvent::Modified(path) => {
                self.put(path.clone(), PathChange::Upserted, now);
            }
            FsEvent::Removed(path) => {
                self.put(path.clone(), PathChange::Removed, now);
            }
            FsEvent::Other(path) => {
                self.put(path.clone(), PathChange::Unresolved, now);
            }
            FsEvent::Renamed { from, to } => {
                self.put(from.clone(), PathChange::Removed, now);
                self.put(to.clone(), PathChange::Upserted, now);
            }
            FsEvent::Rescan | FsEvent::Error(_) => {}
        }
    }

    fn put(&mut self, path: PathBuf, change: PathChange, now: Instant) {
        self.entries.insert(
            path,
            PendingEntry {
                change,
                deadline: now + DEBOUNCE_DURATION,
            },
        );
    }

    /// 次の発火までの残時間。保留が無ければ `None`（= 無限ブロック）。
    ///
    /// deadline が既に過ぎていれば `Duration::ZERO` を返す（saturating）。
    pub(crate) fn next_wait(&self, now: Instant) -> Option<Duration> {
        self.entries
            .values()
            .map(|entry| entry.deadline)
            .min()
            .map(|deadline| deadline.saturating_duration_since(now))
    }

    /// deadline ≤ now のエントリを取り出して 1 つの batch にまとめる。
    ///
    /// 該当が無ければ `None`（空 batch は送出しない）。
    pub(crate) fn drain_due(&mut self, now: Instant) -> Option<FileChangeBatch> {
        self.drain_due_with(now, |path| path.exists())
    }

    /// `drain_due` の実在判定を差し替えられるテスト用入口。
    pub(crate) fn drain_due_with(
        &mut self,
        now: Instant,
        exists: impl Fn(&Path) -> bool,
    ) -> Option<FileChangeBatch> {
        let due: Vec<PathBuf> = self
            .entries
            .iter()
            .filter(|(_, entry)| entry.deadline <= now)
            .map(|(path, _)| path.clone())
            .collect();
        self.take(due, exists)
    }

    /// 残っている保留を deadline に関係なく全部取り出す（Drop 時 flush 用）。
    pub(crate) fn drain_all(&mut self) -> Option<FileChangeBatch> {
        self.drain_all_with(|path| path.exists())
    }

    /// `drain_all` の実在判定を差し替えられるテスト用入口。
    pub(crate) fn drain_all_with(
        &mut self,
        exists: impl Fn(&Path) -> bool,
    ) -> Option<FileChangeBatch> {
        let all: Vec<PathBuf> = self.entries.keys().cloned().collect();
        self.take(all, exists)
    }

    /// 指定 path 群を entries から取り出し、決定的な順序で batch に組む。
    ///
    /// 順序は deadline 昇順、同点は path 昇順。`HashMap` の反復順をそのまま
    /// 使うと上位層に届く適用順が実行ごとに変わる。
    fn take(
        &mut self,
        mut paths: Vec<PathBuf>,
        exists: impl Fn(&Path) -> bool,
    ) -> Option<FileChangeBatch> {
        if paths.is_empty() {
            return None;
        }
        paths.sort_by(|a, b| {
            let deadline_a = self.entries[a].deadline;
            let deadline_b = self.entries[b].deadline;
            deadline_a.cmp(&deadline_b).then_with(|| a.cmp(b))
        });

        let mut batch = FileChangeBatch::default();
        for path in paths {
            let entry = self.entries.remove(&path).expect("key was just collected");
            let upserted = match entry.change {
                PathChange::Upserted => true,
                PathChange::Removed => false,
                PathChange::Unresolved => exists(&path),
            };
            if upserted {
                batch.upserted.push(path);
            } else {
                batch.removed.push(path);
            }
        }
        Some(batch)
    }
}

#[cfg(test)]
#[path = "pending_changes_tests.rs"]
mod pending_changes_tests;
