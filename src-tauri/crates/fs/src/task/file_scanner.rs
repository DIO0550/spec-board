use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use thiserror::Error;

use super::content_limits::{BINARY_PROBE_LEN, MAX_FILE_SIZE};

/// 指定ディレクトリ配下の `.md` ファイルを再帰的に列挙する。
///
/// - 拡張子 `.md` の判定は大文字小文字を区別しない（`.MD` / `.Md` / `.mD` も対象）
/// - 先頭が `.` のディレクトリ・ファイル（`.git` / `.vscode` / `.DS_Store` / `.hidden.md` 等）は除外
/// - ディレクトリ名が `node_modules` のものは深さを問わず除外
/// - シンボリックリンクは辿らない（リンク先は走査しない）
/// - 非 UTF-8 のパスを含む `.md` 候補は `InvalidPath` warning として記録し、ほかのファイルの走査を継続
/// - サイズが 1MB（1,048,576 byte）を超えるファイルは除外（1MB ちょうどは含める）
/// - 先頭 8KB に NUL byte (0x00) を含むバイナリ判定ファイルは除外
/// - ファイル単位の I/O エラー（権限不足 / metadata 取得失敗 / read 失敗等）は warning に変換し、走査を継続
/// - 返却される `PathBuf` は `root` からの相対パス
///
/// 除外パターン（先頭ドット / `node_modules`）は **root 配下の子孫エントリにのみ適用** する。
/// 利用者が `~/.spec-board/` のような隠しフォルダや `node_modules` という名前のディレクトリ
/// 自体を root として渡しても、root 配下の探索は通常通り行う。
///
/// # Errors
///
/// 以下のいずれの場合も [`ScanError::Io`] を返す:
///
/// - `root` 自体が存在しない、またはアクセスできない（権限不足等）
/// - `root` がディレクトリでない（ファイル等）
pub fn scan_md_files(root: &Path) -> Result<Vec<PathBuf>, ScanError> {
    Ok(scan_md_files_with_warnings(root)?.items)
}

/// 指定ディレクトリ配下の md ファイルと、採用できなかった個別エントリの warning を返す。
///
/// root 自体の I/O 失敗は従来どおり ScanError::Io として全体を失敗させる。
/// 一方、root 配下の個別エントリに関する失敗は warning に変換し、他のファイルの
/// 走査を継続する。
pub fn scan_md_files_with_warnings(root: &Path) -> Result<ScanOutcome, ScanError> {
    let metadata = std::fs::metadata(root).map_err(|source| ScanError::Io {
        path: root.to_path_buf(),
        source,
    })?;
    if !metadata.is_dir() {
        return Err(ScanError::Io {
            path: root.to_path_buf(),
            source: std::io::Error::from(std::io::ErrorKind::NotADirectory),
        });
    }
    std::fs::read_dir(root).map_err(|source| ScanError::Io {
        path: root.to_path_buf(),
        source,
    })?;

    let walker = walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_descend);
    let mut items = Vec::new();
    let mut warnings = Vec::new();

    for entry_result in walker {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(ScanWarning {
                    code: ScanWarningCode::EntryError,
                    path: error
                        .path()
                        .and_then(|path| relative_path_string(path, root)),
                    message: error.to_string(),
                });
                continue;
            }
        };
        if !is_candidate_entry(&entry) {
            continue;
        }

        if entry.path().to_str().is_none() {
            warnings.push(ScanWarning {
                code: ScanWarningCode::InvalidPath,
                path: None,
                message: format!(
                    "path cannot be represented as UTF-8: {}",
                    entry.path().to_string_lossy()
                ),
            });
            continue;
        }

        let relative_path = match relative_path(entry.path(), root) {
            Some(path) => path,
            None => {
                warnings.push(ScanWarning {
                    code: ScanWarningCode::InvalidPath,
                    path: None,
                    message: format!(
                        "path is outside the scan root or cannot be represented as UTF-8: {}",
                        entry.path().to_string_lossy()
                    ),
                });
                continue;
            }
        };
        let relative = relative_path.to_string_lossy().into_owned();
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                warnings.push(ScanWarning {
                    code: ScanWarningCode::MetadataError,
                    path: Some(relative),
                    message: error.to_string(),
                });
                continue;
            }
        };
        if metadata.len() > MAX_FILE_SIZE {
            warnings.push(ScanWarning {
                code: ScanWarningCode::FileTooLarge,
                path: Some(relative),
                message: format!("file is larger than the {} byte limit", MAX_FILE_SIZE),
            });
            continue;
        }
        match probe_text(entry.path()) {
            Ok(true) => items.push(relative_path),
            Ok(false) => warnings.push(ScanWarning {
                code: ScanWarningCode::BinaryFile,
                path: Some(relative),
                message: format!(
                    "file contains a NUL byte in the first {} bytes",
                    BINARY_PROBE_LEN
                ),
            }),
            Err(error) => warnings.push(ScanWarning {
                code: ScanWarningCode::UnreadableFile,
                path: Some(relative),
                message: error.to_string(),
            }),
        }
    }

    Ok(ScanOutcome { items, warnings })
}

/// 走査中の per-entry warning code。
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ScanWarningCode {
    EntryError,
    MetadataError,
    FileTooLarge,
    BinaryFile,
    InvalidPath,
    UnreadableFile,
}

/// scanner が返す per-entry warning。
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScanWarning {
    pub code: ScanWarningCode,
    pub path: Option<String>,
    pub message: String,
}

/// scanner の採用項目と warning の組。
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScanOutcome {
    pub items: Vec<PathBuf>,
    pub warnings: Vec<ScanWarning>,
}

/// `WalkDir` のエントリが通常の markdown ファイル候補かを判定する。
fn is_candidate_entry(entry: &walkdir::DirEntry) -> bool {
    entry.depth() > 0 && entry.file_type().is_file() && is_md_extension(entry.path())
}

/// `path` を `root` からの相対パスに変換し、UTF-8 として表現可能な場合のみ返す。
///
/// `path` が `root` 配下でない場合、または相対パスが UTF-8 として表現できない場合は `None`。
fn relative_path(path: &Path, root: &Path) -> Option<PathBuf> {
    let rel = path.strip_prefix(root).ok()?;
    rel.to_str()?;
    Some(rel.to_path_buf())
}

fn relative_path_string(path: &Path, root: &Path) -> Option<String> {
    relative_path(path, root).and_then(|relative| relative.to_str().map(ToOwned::to_owned))
}

/// 先頭 [`BINARY_PROBE_LEN`] byte をプローブし、NUL byte を含まなければテキストと判定する。
///
/// open / read に失敗した場合は false（除外側）を返す。
/// プローブ範囲を超えた位置の NUL byte は判定対象外（仕様として固定）。
/// 空ファイルは NUL byte なし扱いで true。
fn probe_text(path: &Path) -> std::io::Result<bool> {
    let mut file = File::open(path)?;
    let mut buf = [0u8; BINARY_PROBE_LEN];
    let mut filled = 0usize;
    while filled < BINARY_PROBE_LEN {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        }
    }
    Ok(!buf[..filled].contains(&0u8))
}

fn is_text(path: &Path) -> bool {
    probe_text(path).unwrap_or(false)
}

/// [`scan_md_files`] 実行時に発生し得る致命的エラー。
///
/// 個別ファイル / ディレクトリ単位の I/O エラー（権限不足など）は本エラーには
/// 含まれず、`scan_md_files_with_warnings` の warning として返される。
#[derive(Debug, Error)]
pub enum ScanError {
    /// 走査のルートに関する I/O エラー（不在 / 権限不足 / ディレクトリでない 等）。
    /// `path` には `scan_md_files` に渡された root のコピーを保持し、エラーの
    /// 文脈を残す（OS のエラーメッセージだけではどのパスで失敗したか不明になるため）。
    #[error("failed to scan directory `{path}`: {source}", path = path.display())]
    Io {
        path: std::path::PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// 除外対象のエントリ名（ディレクトリ・ファイル両方）かどうかを判定する。
///
/// `WalkDir::filter_entry` は `DirEntry` の種別を問わず呼ばれるため、本関数は
/// ディレクトリ名 / ファイル名の両方に対して同じ条件で判定を行う。ファイル側でも
/// ドット始まり名の `.md`（例: `.hidden.md`）を早期に枝刈りでき、効率的。
///
/// - 先頭が `.` のもの（隠しディレクトリ・隠しファイル。例: `.git`, `.vscode`, `.hidden.md`）
/// - `node_modules`（完全一致 / 通常はディレクトリだが同名ファイルにも適用される）
fn is_excluded_entry_name(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

/// 拡張子が `.md` かどうかを大文字小文字を区別せず判定する。
///
/// 拡張子が無いパスや、非 UTF-8 拡張子の場合は `false`。
fn is_md_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

/// 単一の絶対パスがタスク `.md` ファイルとして取り込み対象になるかを判定し、
/// 対象であれば `root` 相対の `PathBuf` を返す。
///
/// `scan_md_files` の判定ロジックと同じ条件を **1 件**の絶対パスに対して
/// 適用する。watcher 経由のイベントなど、`scan_md_files` を経ずに任意の
/// 絶対パスを判定したい場面で使う。
///
/// 対象条件（すべて満たした場合のみ `Some`）:
/// - `abs_path` が `root` の配下である
/// - 通常ファイルである（dir / symlink などは除外）。判定は
///   `symlink_metadata` で行い、symlink を辿らない（`scan_md_files` の
///   `WalkDir::follow_links(false)` と挙動を揃える）
/// - 拡張子が `.md`（大文字小文字非区別）
/// - root 配下の各 path component が `.` で始まらず `node_modules` でもない
/// - サイズが [`MAX_FILE_SIZE`] byte 以下
/// - 先頭 [`BINARY_PROBE_LEN`] byte に NUL byte を含まない
/// - root 相対パスが UTF-8 として表現可能
///
/// I/O 失敗（metadata 取得失敗 / open 失敗 / read 失敗）は `None`（除外側）として扱う。
pub fn task_md_relative_path(abs_path: &Path, root: &Path) -> Option<PathBuf> {
    let rel = abs_path.strip_prefix(root).ok()?;
    if rel.as_os_str().is_empty() {
        return None;
    }
    if !is_md_extension(abs_path) {
        return None;
    }
    for component in rel.iter() {
        let name = component.to_str()?;
        if is_excluded_entry_name(name) {
            return None;
        }
    }
    let metadata = std::fs::symlink_metadata(abs_path).ok()?;
    if !metadata.file_type().is_file() {
        return None;
    }
    if metadata.len() > MAX_FILE_SIZE {
        return None;
    }
    if !is_text(abs_path) {
        return None;
    }
    rel.to_str()?;
    Some(rel.to_path_buf())
}

/// `WalkDir` のエントリが pruning 対象（除外ディレクトリ自身、または除外ディレクトリ配下）かを判定する。
///
/// `entry.depth() == 0` の場合は root 自身であり、除外パターンは適用しない
/// （root のディレクトリ名が `.workspace` や `node_modules` でも root 配下の探索を継続する）。
/// 除外パターンは root 配下の子孫エントリにのみ適用する。
///
/// 非 UTF-8 のエントリ名は `filter_entry` で枝刈りせず、`.md` 候補まで到達させる。
/// その候補を `scan_md_files_with_warnings` が `InvalidPath` warning として報告する。
fn should_descend(entry: &walkdir::DirEntry) -> bool {
    if entry.depth() == 0 {
        return true;
    }
    let Some(name) = entry.file_name().to_str() else {
        return true;
    };
    !is_excluded_entry_name(name)
}

#[cfg(test)]
#[path = "file_scanner_tests.rs"]
mod file_scanner_tests;
