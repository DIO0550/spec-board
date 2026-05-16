//! Task ドメイン用 I/O ポート。
//!
//! `std::fs` の薄い wrap を `TaskIo` trait として抽象化し、effect 層
//! (`task::create::command` / `watcher_event::handler`) から `std::fs::*` の
//! 直接呼び出しを追放する。
//!
//! 本ファイルは `spec-board-fs` には置かない。`std::fs` への薄い委譲のみで
//! 重い外部 crate には依存しないため、CLAUDE.md の「重い外部 crate に依存する
//! 処理を集約」基準を満たさない。

use std::io;
use std::path::Path;

use thiserror::Error;

// テスト用 InMemoryTaskIo でのみ使う型は cfg(test) でゲートし、
// リリースビルドに不要なシンボルを残さない。
#[cfg(test)]
use std::collections::{HashMap, HashSet};
#[cfg(test)]
use std::path::PathBuf;
#[cfg(test)]
use std::sync::Mutex;

/// MD ファイル / ディレクトリ操作の最小ポート。
///
/// 観測挙動は `std::fs` と等価になるよう揃え、effect 層からの直接呼び出しを
/// 禁ずるためのインタフェースとして機能する。本番実装 `FsTaskIo` と
/// テスト用 `InMemoryTaskIo` は同じ契約で振る舞う。
pub trait TaskIo: Send + Sync {
    /// `dir` 配下を `create_dir_all` 相当で確保する（冪等）。
    fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError>;

    /// 排他作成 (`OpenOptions::create_new`) で `path` に `bytes` を書き込む。
    ///
    /// 契約:
    /// - 既存ファイル衝突時は `io::ErrorKind::AlreadyExists` を含む
    ///   `TaskIoError::Io` を返し、**既存ファイルは変更・削除しない**
    ///   （内容温存）。
    /// - 排他作成成功後の `write_all` 失敗時は、adapter 実装側で `path` を
    ///   best-effort 削除（partial-write cleanup）してから `Err` を返す。
    ///   `remove` 自身が `NotFound` を返した場合は無視する。
    /// - 呼び出し側 (effect 層) は失敗時に追加の cleanup (`io.remove` 等) を
    ///   行わない（二重削除防止）。
    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError>;

    /// 既存ファイル前提の上書き書き込み。
    ///
    /// 契約:
    /// - `path` が存在しない場合の挙動は実装依存（`FsTaskIo` は新規作成し得る）。
    ///   effect 層は呼び出し前に必ず `read()` で存在を確認する。
    /// - 書き込みは **アトミック** であること。`Err` を返した場合、`path` の内容は
    ///   呼び出し前と同一であることを保証する（部分書き込みで破壊しない）。
    ///   `FsTaskIo` は同一ディレクトリの一時ファイルに書いてから `rename` する
    ///   POSIX atomic 契約で実現する。
    /// - `path` がディレクトリを指す場合は `Err` を返す。
    fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError>;

    /// `path` を削除する。`NotFound` も `Err` として返し、呼び出し側で
    /// `io::Error::kind()` 判定する。
    fn remove(&self, path: &Path) -> Result<(), TaskIoError>;

    /// `path` の全バイトを読む。
    fn read(&self, path: &Path) -> Result<Vec<u8>, TaskIoError>;
}

/// `std::io::Error` を `#[from]` で取り込むだけの薄い wrapper。
///
/// 独自 variant (`AlreadyExists` 等) は持たない。kind 判定は呼び出し側で
/// `io::Error::kind()` で行う。Display は inner `io::Error` を素通しする。
#[derive(Debug, Error)]
pub enum TaskIoError {
    #[error("{0}")]
    Io(#[from] io::Error),
}

/// 本番実装。`std::fs` を直接呼ぶ薄い adapter。
pub struct FsTaskIo;

impl TaskIo for FsTaskIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
        std::fs::create_dir_all(dir).map_err(TaskIoError::from)
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)?;
        if let Err(err) = file.write_all(bytes) {
            drop(file);
            if let Err(rm_err) = std::fs::remove_file(path) {
                if rm_err.kind() != io::ErrorKind::NotFound {
                    log::warn!(
                        "FsTaskIo::write_new: failed to clean up partial file `{}`: {rm_err}",
                        path.display()
                    );
                }
            }
            return Err(TaskIoError::Io(err));
        }
        Ok(())
    }

    fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        // アトミック上書き: 同一ディレクトリの一時ファイルに書き込んだ後 rename する。
        // disk-full 等で書き込みが途中失敗しても元ファイルは無傷で残る
        // （rename は同一ファイルシステム上で atomic、POSIX 契約）。
        let tmp_path = atomic_tmp_path_for(path);
        if let Err(err) = std::fs::write(&tmp_path, bytes) {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(TaskIoError::from(err));
        }
        if let Err(err) = std::fs::rename(&tmp_path, path) {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(TaskIoError::from(err));
        }
        Ok(())
    }

    fn remove(&self, path: &Path) -> Result<(), TaskIoError> {
        std::fs::remove_file(path).map_err(TaskIoError::from)
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, TaskIoError> {
        std::fs::read(path).map_err(TaskIoError::from)
    }
}

/// `write_existing` のアトミック書き込み用 tmp パスを組み立てる。
///
/// dotfile + `.tmp` 拡張子で命名し、scanner / watcher の `.md` フィルタを通過しない
/// ようにする。process id + 高精度時刻で同時実行衝突を最小化する（厳密な一意性は
/// 必要としない: rename は atomic で、衝突しても最後に rename した内容で確定する）。
fn atomic_tmp_path_for(path: &Path) -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("update");
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id();
    parent.join(format!(".{filename}.{pid}.{nanos}.update.tmp"))
}

/// テスト用 in-memory 実装。`PathBuf` キーの `HashMap` で状態を保持する。
///
/// 観測挙動が `FsTaskIo` と一致するよう、`std::io::ErrorKind` をそのまま
/// 使ったエラーを返す。partial-write の概念は HashMap 上に存在しないため
/// cleanup は不要だが、衝突時に既存エントリへ触らない契約は守る。
///
/// 公開 API 表面を最小化するため `#[cfg(test)]` で完全にゲートし、リリースビルド
/// には一切含めない。crate 外には漏らさず、io_tests.rs と同 crate 内のテスト
/// からのみ使う。
#[cfg(test)]
pub(crate) struct InMemoryTaskIo {
    inner: Mutex<InMemoryState>,
}

#[cfg(test)]
#[derive(Default)]
struct InMemoryState {
    files: HashMap<PathBuf, Vec<u8>>,
    dirs: HashSet<PathBuf>,
}

#[cfg(test)]
impl InMemoryTaskIo {
    pub(crate) fn new() -> Self {
        Self {
            inner: Mutex::new(InMemoryState::default()),
        }
    }

    /// テスト用ユーティリティ: 既存ディレクトリとして `dir` を予め登録する。
    pub(crate) fn pre_register_dir(&self, dir: &Path) {
        let mut g = self.inner.lock().expect("InMemoryTaskIo lock");
        register_dir_chain(&mut g.dirs, dir);
    }
}

#[cfg(test)]
impl Default for InMemoryTaskIo {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
impl TaskIo for InMemoryTaskIo {
    fn ensure_dir(&self, dir: &Path) -> Result<(), TaskIoError> {
        let mut g = self.inner.lock().expect("InMemoryTaskIo lock");
        // `dir` 自身がファイルなら create_dir_all 同様 Err
        if g.files.contains_key(dir) {
            return Err(TaskIoError::Io(io::Error::new(
                io::ErrorKind::AlreadyExists,
                "path exists as a file",
            )));
        }
        // 中間 component がファイルとして既存ならエラー（std::fs::create_dir_all
        // と挙動を揃える: 中間にファイルがあると mkdir に失敗する）
        let mut ancestor = dir.parent();
        while let Some(p) = ancestor {
            if p.as_os_str().is_empty() {
                break;
            }
            if g.files.contains_key(p) {
                return Err(TaskIoError::Io(io::Error::new(
                    io::ErrorKind::NotADirectory,
                    "ancestor is a file",
                )));
            }
            ancestor = p.parent();
        }
        register_dir_chain(&mut g.dirs, dir);
        Ok(())
    }

    fn write_new(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        let mut g = self.inner.lock().expect("InMemoryTaskIo lock");
        if g.files.contains_key(path) {
            return Err(TaskIoError::Io(io::Error::from(
                io::ErrorKind::AlreadyExists,
            )));
        }
        if g.dirs.contains(path) {
            return Err(TaskIoError::Io(io::Error::new(
                io::ErrorKind::IsADirectory,
                "path is a directory",
            )));
        }
        match path.parent() {
            Some(parent) if !parent.as_os_str().is_empty() => {
                if g.files.contains_key(parent) {
                    return Err(TaskIoError::Io(io::Error::new(
                        io::ErrorKind::NotADirectory,
                        "parent is a file",
                    )));
                }
                if !g.dirs.contains(parent) {
                    return Err(TaskIoError::Io(io::Error::from(io::ErrorKind::NotFound)));
                }
            }
            _ => {}
        }
        g.files.insert(path.to_path_buf(), bytes.to_vec());
        Ok(())
    }

    fn write_existing(&self, path: &Path, bytes: &[u8]) -> Result<(), TaskIoError> {
        let mut g = self.inner.lock().expect("InMemoryTaskIo lock");
        if g.dirs.contains(path) {
            return Err(TaskIoError::Io(io::Error::new(
                io::ErrorKind::IsADirectory,
                "path is a directory",
            )));
        }
        g.files.insert(path.to_path_buf(), bytes.to_vec());
        Ok(())
    }

    fn remove(&self, path: &Path) -> Result<(), TaskIoError> {
        let mut g = self.inner.lock().expect("InMemoryTaskIo lock");
        if g.dirs.contains(path) {
            return Err(TaskIoError::Io(io::Error::new(
                io::ErrorKind::IsADirectory,
                "path is a directory",
            )));
        }
        if g.files.remove(path).is_none() {
            return Err(TaskIoError::Io(io::Error::from(io::ErrorKind::NotFound)));
        }
        Ok(())
    }

    fn read(&self, path: &Path) -> Result<Vec<u8>, TaskIoError> {
        let g = self.inner.lock().expect("InMemoryTaskIo lock");
        if g.dirs.contains(path) {
            return Err(TaskIoError::Io(io::Error::new(
                io::ErrorKind::IsADirectory,
                "path is a directory",
            )));
        }
        g.files
            .get(path)
            .cloned()
            .ok_or_else(|| TaskIoError::Io(io::Error::from(io::ErrorKind::NotFound)))
    }
}

#[cfg(test)]
fn register_dir_chain(dirs: &mut HashSet<PathBuf>, dir: &Path) {
    let mut cur = Some(dir);
    while let Some(p) = cur {
        if p.as_os_str().is_empty() {
            break;
        }
        if !dirs.insert(p.to_path_buf()) {
            break;
        }
        cur = p.parent();
    }
}

#[cfg(test)]
#[path = "io_tests.rs"]
mod io_tests;
