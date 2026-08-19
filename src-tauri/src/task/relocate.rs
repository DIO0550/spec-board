//! タスク md をタスクツリー外（`.spec-board/` 配下の退避先）へ移動する共通ヘルパー。
//!
//! アーカイブ（`.spec-board/archive/`）とゴミ箱（`.spec-board/trash/`）が同じ
//! 「read → 排他 write → remove」の移動と連番衝突回避を共有する。
//! rename 専用メソッドを `TaskIo` port に増やさない（`InMemoryTaskIo` など
//! 全実装への波及を避け、既存の 4 操作の合成で移動を表現する）。

use std::path::{Path, PathBuf};

use crate::task::io::{TaskIo, TaskIoError};

/// 移動先ファイル名の連番リトライ上限。
///
/// 同名衝突は「同じ相対パスのタスクを作り直して再退避した」場合にしか起きない
/// ため、実運用でこの上限に届くことはない（届いた場合は異常系としてエラーにする）。
const DESTINATION_RETRY_LIMIT: u32 = 100;

/// 移動の失敗理由。呼び出し側 command のエラー型へ写像する。
#[derive(Debug)]
pub(crate) enum RelocateError {
    /// 移動元が存在しない。
    SourceNotFound,
    /// 連番リトライ上限まで空きが見つからなかった。
    DestinationUnavailable,
    /// 上記以外の I/O 失敗。
    Io(TaskIoError),
}

/// `src` を `dest` へ移動し、実際に書き込んだパスを返す。
///
/// `dest` が既に存在する場合はファイル名へ `-2` からの連番を付けて空きを探す。
/// 既存ファイルは上書きしない（`write_new` の排他作成契約に依存する）。
pub(crate) fn move_md_file(
    io: &dyn TaskIo,
    src: &Path,
    dest: &Path,
) -> Result<PathBuf, RelocateError> {
    let bytes = match io.read(src) {
        Ok(bytes) => bytes,
        Err(TaskIoError::Io(source)) if source.kind() == std::io::ErrorKind::NotFound => {
            return Err(RelocateError::SourceNotFound);
        }
        Err(error) => return Err(RelocateError::Io(error)),
    };
    if let Some(parent) = dest.parent() {
        io.ensure_dir(parent).map_err(RelocateError::Io)?;
    }
    let written = write_new_with_numbered_retry(io, dest, &bytes)?;
    io.remove(src).map_err(RelocateError::Io)?;
    Ok(written)
}

/// 排他作成が `AlreadyExists` で失敗する間、`-2` からの連番を付けて空きを探す。
fn write_new_with_numbered_retry(
    io: &dyn TaskIo,
    dest: &Path,
    bytes: &[u8],
) -> Result<PathBuf, RelocateError> {
    let mut candidate = dest.to_path_buf();
    let mut suffix = 2_u32;
    loop {
        match io.write_new(&candidate, bytes) {
            Ok(()) => return Ok(candidate),
            Err(TaskIoError::Io(source))
                if source.kind() == std::io::ErrorKind::AlreadyExists
                    && suffix <= DESTINATION_RETRY_LIMIT =>
            {
                candidate = numbered_candidate(dest, suffix);
                suffix += 1;
            }
            Err(TaskIoError::Io(source)) if source.kind() == std::io::ErrorKind::AlreadyExists => {
                return Err(RelocateError::DestinationUnavailable);
            }
            Err(error) => return Err(RelocateError::Io(error)),
        }
    }
}

/// `foo.md` に対する `foo-2.md` のような連番候補パスを組み立てる。
fn numbered_candidate(dest: &Path, suffix: u32) -> PathBuf {
    let stem = dest
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("task");
    let ext = dest
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("md");
    dest.with_file_name(format!("{stem}-{suffix}.{ext}"))
}
