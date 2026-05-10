use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use thiserror::Error;

/// このサイズを超える `.md` ファイルは scan 結果から除外する（バイト単位）。
/// 巨大ファイルはタスクとして扱わないという仕様に基づく一次フィルタ。
/// `> MAX_FILE_SIZE` で除外するため、1,048,576 byte ちょうどは含める。
const MAX_FILE_SIZE: u64 = 1024 * 1024;

/// バイナリ判定のために先頭からプローブするバイト数。
/// この範囲内に NUL byte (0x00) が含まれていればバイナリと判定し除外する。
/// プローブ範囲を超えた位置の NUL byte は判定対象外。
const BINARY_PROBE_LEN: usize = 8 * 1024;

/// 指定ディレクトリ配下の `.md` ファイルを再帰的に列挙する。
///
/// - 拡張子 `.md` の判定は大文字小文字を区別しない（`.MD` / `.Md` / `.mD` も対象）
/// - 先頭が `.` のディレクトリ・ファイル（`.git` / `.vscode` / `.DS_Store` / `.hidden.md` 等）は除外
/// - ディレクトリ名が `node_modules` のものは深さを問わず除外
/// - シンボリックリンクは辿らない（リンク先は走査しない）
/// - 非 UTF-8 のパスを含むエントリは保守的に除外（後続の Tauri / JSON 境界で扱えないため）
/// - サイズが 1MB（1,048,576 byte）を超えるファイルは除外（1MB ちょうどは含める）
/// - 先頭 8KB に NUL byte (0x00) を含むバイナリ判定ファイルは除外
/// - ファイル単位の I/O エラー（権限不足 / metadata 取得失敗 / read 失敗等）は黙って skip し、走査を継続する
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
    // Unix では権限のないディレクトリでも `metadata` は成功するため、`read_dir` で
    // root のアクセス可否を確定させる。per-entry の I/O エラーは後段で skip するので、
    // ここで弾かないと「アクセス不可の root」が `Ok(vec![])` として返ってしまう。
    std::fs::read_dir(root).map_err(|source| ScanError::Io {
        path: root.to_path_buf(),
        source,
    })?;

    let walker = walkdir::WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(should_descend);

    let mut results: Vec<PathBuf> = Vec::new();

    for entry_result in walker {
        let entry = match entry_result {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !should_include(&entry) {
            continue;
        }
        if let Some(rel) = relative_path(entry.path(), root) {
            results.push(rel);
        }
    }

    Ok(results)
}

/// `WalkDir` のエントリ属性 / ファイル内容ベースのフィルタを満たすかを判定する。
///
/// 判定条件（早期 return 順、軽い判定 → 重い判定）:
/// 1. root 自身ではない（`depth() > 0`）
/// 2. 通常ファイル
/// 3. 拡張子 `.md`（大文字小文字非区別）
/// 4. ファイル名がドットで始まらない
/// 5. サイズが [`MAX_FILE_SIZE`] byte 以下
/// 6. 先頭 [`BINARY_PROBE_LEN`] byte に NUL byte を含まない
///
/// I/O 失敗（metadata 取得失敗 / open 失敗 / read 失敗）は `false`（除外側）として扱う。
///
/// **責務の境界**: 本関数はエントリ単体のフィルタのみを担当する。
/// root 相対パスへの変換と UTF-8 表現可能性の確認は [`relative_path`] が担当し、
/// 最終的にスキャン結果に含めるかは「`should_include` が `true` かつ `relative_path` が `Some`」の AND 条件で決まる。
fn should_include(entry: &walkdir::DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    if !entry.file_type().is_file() {
        return false;
    }
    let path = entry.path();
    if !is_md_extension(path) {
        return false;
    }
    let starts_with_dot = path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(true);
    if starts_with_dot {
        return false;
    }
    if !is_size_within_limit(entry) {
        return false;
    }
    if !is_text(path) {
        return false;
    }
    true
}

/// `path` を `root` からの相対パスに変換し、UTF-8 として表現可能な場合のみ返す。
///
/// `path` が `root` 配下でない場合、または相対パスが UTF-8 として表現できない場合は `None`。
fn relative_path(path: &Path, root: &Path) -> Option<PathBuf> {
    let rel = path.strip_prefix(root).ok()?;
    rel.to_str()?;
    Some(rel.to_path_buf())
}

/// エントリのサイズが上限以内（[`MAX_FILE_SIZE`] byte 以下）かを判定する。
///
/// `> MAX_FILE_SIZE` で除外するため 1,048,576 byte ちょうどは含める。
/// metadata 取得に失敗した場合は false（除外側）を返す。
/// `entry.metadata()` を使うことで walkdir 内部キャッシュを活用できる。
fn is_size_within_limit(entry: &walkdir::DirEntry) -> bool {
    match entry.metadata() {
        Ok(m) => m.len() <= MAX_FILE_SIZE,
        Err(_) => false,
    }
}

/// 先頭 [`BINARY_PROBE_LEN`] byte をプローブし、NUL byte を含まなければテキストと判定する。
///
/// open / read に失敗した場合は false（除外側）を返す。
/// プローブ範囲を超えた位置の NUL byte は判定対象外（仕様として固定）。
/// 空ファイルは NUL byte なし扱いで true。
fn is_text(path: &Path) -> bool {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut buf = [0u8; BINARY_PROBE_LEN];
    let mut filled = 0usize;
    while filled < BINARY_PROBE_LEN {
        match file.read(&mut buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return false,
        }
    }
    !buf[..filled].contains(&0u8)
}

/// [`scan_md_files`] 実行時に発生し得る致命的エラー。
///
/// 個別ファイル / ディレクトリ単位の I/O エラー（権限不足など）は本エラーには
/// 含まれず、`scan_md_files` 内部で黙って skip される。
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
/// 非 UTF-8 のエントリ名は本走査でも保守的に枝刈りする（`scan_md_files` の最終結果側でも
/// 非 UTF-8 を除外するため重複チェックになるが、`filter_entry` 段階で pruning することで
/// 非 UTF-8 ディレクトリ配下の不要な走査を避けられる）。
fn should_descend(entry: &walkdir::DirEntry) -> bool {
    if entry.depth() == 0 {
        return true;
    }
    let name = match entry.file_name().to_str() {
        Some(s) => s,
        None => return false,
    };
    !is_excluded_entry_name(name)
}

#[cfg(test)]
#[path = "file_scanner_tests.rs"]
mod file_scanner_tests;
