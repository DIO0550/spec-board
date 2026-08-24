//! テスト専用。`FileChangeBatch` の組み立てを 1 箇所に集約する。

use std::path::PathBuf;

use spec_board_fs::watcher::file_change_batch::{FileChangeBatch, FileChangeBatchTestBuilder};

/// fs 層が rename を分解した形の batch（from を removed、to を upserted）。
pub(crate) fn rename_batch(from: PathBuf, to: PathBuf) -> FileChangeBatch {
    FileChangeBatchTestBuilder::changes(vec![from], vec![to]).build()
}

/// 1 path の upsert だけを持つ batch。
pub(crate) fn upsert_batch(path: PathBuf) -> FileChangeBatch {
    upserts_batch(vec![path])
}

/// 複数 path の upsert を持つ batch。
pub(crate) fn upserts_batch(paths: Vec<PathBuf>) -> FileChangeBatch {
    FileChangeBatchTestBuilder::changes(Vec::new(), paths).build()
}

/// 1 path の削除だけを持つ batch。
pub(crate) fn removed_batch(path: PathBuf) -> FileChangeBatch {
    FileChangeBatchTestBuilder::changes(vec![path], Vec::new()).build()
}
