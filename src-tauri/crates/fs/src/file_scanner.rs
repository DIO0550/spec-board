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
        if let Some(rel) = accept_entry(&entry, root) {
            results.push(rel);
        }
    }

    Ok(results)
}

/// 単一の `WalkDir` エントリを採用するかを判定し、採用するなら root からの相対パスを返す。
///
/// 採用条件は早期 return で並べ、軽い判定を先に行う:
/// 1. root 自身ではない（`depth() > 0`）
/// 2. 通常ファイル
/// 3. 拡張子 `.md`（大文字小文字非区別）
/// 4. ファイル名がドットで始まらない
/// 5. root からの相対パスが算出でき、UTF-8 として表現可能
/// 6. サイズが [`MAX_FILE_SIZE`] byte 以下
/// 7. 先頭 [`BINARY_PROBE_LEN`] byte に NUL byte を含まない
///
/// I/O 失敗（metadata 取得失敗 / open 失敗 / read 失敗）は `None` を返し、呼び出し側で skip される。
fn accept_entry(entry: &walkdir::DirEntry, root: &Path) -> Option<PathBuf> {
    if entry.depth() == 0 {
        return None;
    }
    if !entry.file_type().is_file() {
        return None;
    }
    let path = entry.path();
    if !is_md_extension(path) {
        return None;
    }
    let starts_with_dot = path
        .file_name()
        .and_then(|s| s.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(true);
    if starts_with_dot {
        return None;
    }
    let rel = path.strip_prefix(root).ok()?;
    rel.to_str()?;
    if !is_size_within_limit(entry) {
        return None;
    }
    if !is_text_by_probe(path) {
        return None;
    }
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
fn is_text_by_probe(path: &Path) -> bool {
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
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn make_files(root: &Path, files: &[&str]) {
        for rel in files {
            let path = root.join(rel);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).unwrap();
            }
            std::fs::write(&path, "").unwrap();
        }
    }

    /// 指定したバイト列を実体としてファイルに書き込む。
    ///
    /// バイナリ判定（先頭 8KB の NUL byte 検査）が走るテストでは、内容が NUL byte を
    /// 含むかどうかでテスト結果が変わるため、必ずこの関数で実体を制御する。
    fn make_file_with_bytes(root: &Path, rel: &str, contents: &[u8]) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(&path, contents).unwrap();
    }

    /// 指定サイズの sparse ファイルを作る。`set_len` の確保領域は NUL byte 埋めになるため、
    /// **サイズチェックで先に除外されるケース専用**。バイナリチェック通過を期待するテストには
    /// `make_file_with_bytes` を使い、明示的に NUL byte を含まない内容を書き込むこと。
    fn make_file_with_size(root: &Path, rel: &str, len: u64) {
        let path = root.join(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        let f = std::fs::File::create(&path).unwrap();
        f.set_len(len).unwrap();
    }

    fn collect_sorted_relative(result: &[PathBuf]) -> Vec<String> {
        let mut v: Vec<String> = result
            .iter()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .collect();
        v.sort();
        v
    }

    // ── 単一階層 / 多階層 ──────────────────────────────────────────

    #[test]
    fn scan_md_files_lists_top_level_md_files() {
        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["a.md", "b.md", "c.txt"]);

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["a.md", "b.md"]);
    }

    #[test]
    fn scan_md_files_descends_into_subdirectories() {
        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["a.md", "dir1/b.md", "dir1/dir2/c.md"]);

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(
            collect_sorted_relative(&result),
            vec!["a.md", "dir1/b.md", "dir1/dir2/c.md"]
        );
    }

    // ── 拡張子フィルタ ────────────────────────────────────────────

    #[test]
    fn scan_md_files_extension_filter_cases() {
        let cases: Vec<(&[&str], &[&str], &str)> = vec![
            (
                &["a.md", "b.txt", "noext", "c.md.bak"],
                &["a.md"],
                "non-md extensions are ignored",
            ),
            (
                &["A.MD", "b.Md", "c.mD", "d.md", "e.txt"],
                &["A.MD", "b.Md", "c.mD", "d.md"],
                "md extension is matched case-insensitively",
            ),
        ];

        for (input, expected, label) in cases {
            let dir = TempDir::new().unwrap();
            make_files(dir.path(), input);

            let result = scan_md_files(dir.path()).unwrap();
            let mut want: Vec<String> = expected.iter().map(|s| s.to_string()).collect();
            want.sort();
            assert_eq!(collect_sorted_relative(&result), want, "{label}");
        }
    }

    // ── 除外パターン ──────────────────────────────────────────────

    #[test]
    fn scan_md_files_exclusion_patterns() {
        let cases: Vec<(&[&str], &[&str], &str)> = vec![
            (
                &["a.md", "node_modules/x.md", "node_modules/sub/y.md"],
                &["a.md"],
                "top-level node_modules is excluded",
            ),
            (
                &[
                    "a.md",
                    "pkgs/foo/node_modules/x.md",
                    "pkgs/foo/keep.md",
                    "pkgs/foo/bar/node_modules/y.md",
                ],
                &["a.md", "pkgs/foo/keep.md"],
                "deep node_modules is excluded",
            ),
            (
                &[
                    "a.md",
                    ".git/y.md",
                    ".vscode/z.md",
                    ".github/w.md",
                    "nested/.cache/v.md",
                ],
                &["a.md"],
                "dot-prefixed directories are excluded",
            ),
            (
                &[
                    "a.md",
                    ".hidden.md",
                    "dir/.secret.md",
                    "dir/visible.md",
                    ".DS_Store",
                    ".env",
                ],
                &["a.md", "dir/visible.md"],
                "dot-prefixed files are excluded",
            ),
        ];

        for (input, expected, label) in cases {
            let dir = TempDir::new().unwrap();
            make_files(dir.path(), input);

            let result = scan_md_files(dir.path()).unwrap();
            let mut want: Vec<String> = expected.iter().map(|s| s.to_string()).collect();
            want.sort();
            assert_eq!(collect_sorted_relative(&result), want, "{label}");
        }
    }

    // ── 境界 ───────────────────────────────────────────────────────

    #[test]
    fn scan_md_files_returns_empty_for_empty_directory() {
        let dir = TempDir::new().unwrap();

        let result = scan_md_files(dir.path()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn scan_md_files_returns_io_error_when_root_does_not_exist() {
        let dir = TempDir::new().unwrap();
        let missing = dir.path().join("does-not-exist");

        let err = scan_md_files(&missing).unwrap_err();
        let ScanError::Io { path, .. } = &err;
        assert_eq!(path, &missing);
        assert!(err.to_string().contains(missing.to_string_lossy().as_ref()));
    }

    #[test]
    fn scan_md_files_returns_io_error_when_root_is_a_file() {
        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["single.md"]);
        let file_path = dir.path().join("single.md");

        let err = scan_md_files(&file_path).unwrap_err();
        let ScanError::Io { path, source } = &err;
        assert_eq!(path, &file_path);
        assert_eq!(source.kind(), std::io::ErrorKind::NotADirectory);
    }

    // ── root 自身に除外パターンを適用しない（防御） ────────────────

    #[test]
    fn scan_md_files_descends_into_excluded_named_root() {
        let cases: Vec<(&str, &[&str], &[&str])> = vec![
            (".workspace", &["a.md", "sub/b.md"], &["a.md", "sub/b.md"]),
            ("node_modules", &["a.md", "sub/b.md"], &["a.md", "sub/b.md"]),
        ];

        for (root_name, files, expected) in cases {
            let dir = TempDir::new().unwrap();
            let root = dir.path().join(root_name);
            std::fs::create_dir(&root).unwrap();
            make_files(&root, files);

            let result = scan_md_files(&root).unwrap();
            let mut want: Vec<String> = expected.iter().map(|s| s.to_string()).collect();
            want.sort();
            assert_eq!(
                collect_sorted_relative(&result),
                want,
                "root named `{root_name}` should still be scanned"
            );
        }
    }

    // ── 返却パスは root からの相対 ─────────────────────────────────

    #[test]
    fn scan_md_files_returns_relative_paths_from_root() {
        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["a.md", "dir/b.md"]);

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(result.len(), 2);
        for rel in &result {
            assert!(
                rel.is_relative(),
                "expected relative path but got absolute: {rel:?}"
            );
            let abs = dir.path().join(rel);
            assert!(abs.is_file(), "joined path should be a real file: {abs:?}");
        }
    }

    // ── アクセス不可な root（cfg(unix) 限定） ──────────────────────

    #[cfg(unix)]
    #[test]
    fn scan_md_files_returns_io_error_when_root_is_not_readable() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new().unwrap();
        let root = dir.path().join("locked");
        std::fs::create_dir(&root).unwrap();
        make_files(&root, &["a.md"]);
        let mut perms = std::fs::metadata(&root).unwrap().permissions();
        perms.set_mode(0o000);
        std::fs::set_permissions(&root, perms).unwrap();

        // uid 0 環境（CI コンテナ等）では `chmod 000` でも読み取れてしまうため、
        // 実際にディレクトリが読めるかどうかを `scan_md_files` 呼び出し前に観測しておく。
        let root_is_actually_readable = std::fs::read_dir(&root).is_ok();
        let result = scan_md_files(&root);

        // テスト後に必ず権限を復元する（TempDir のクリーンアップが失敗するため）。
        let mut restore = std::fs::metadata(&root).unwrap().permissions();
        restore.set_mode(0o755);
        std::fs::set_permissions(&root, restore).unwrap();

        match (root_is_actually_readable, result) {
            (false, Err(ScanError::Io { path, source })) => {
                assert_eq!(path, root);
                assert_eq!(source.kind(), std::io::ErrorKind::PermissionDenied);
            }
            (false, Ok(unexpected)) => {
                panic!("expected PermissionDenied for unreadable root, got Ok({unexpected:?})")
            }
            (true, Ok(_)) => {
                // uid 0 等、chmod 000 でも読めてしまう環境ではスキャンが通る。
            }
            (true, Err(err)) => {
                panic!("expected Ok when root is actually readable (e.g. uid 0), got {err:?}")
            }
        }
    }

    // ── シンボリックリンク非追跡（cfg(unix) 限定） ─────────────────

    #[cfg(unix)]
    #[test]
    fn scan_md_files_does_not_follow_symlinks() {
        use std::os::unix::fs::symlink;

        let dir = TempDir::new().unwrap();
        make_files(dir.path(), &["real/x.md"]);
        symlink(dir.path().join("real"), dir.path().join("link")).unwrap();

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["real/x.md"]);
    }

    // ── サイズフィルタ（1MB 上限） ─────────────────────────────────

    #[test]
    fn scan_md_files_includes_small_text_md_file() {
        let dir = TempDir::new().unwrap();
        make_file_with_bytes(dir.path(), "small.md", &b"a".repeat(1024));

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["small.md"]);
    }

    #[test]
    fn scan_md_files_includes_file_at_exactly_max_size() {
        let dir = TempDir::new().unwrap();
        // ちょうど 1,048,576 byte（NUL byte なし）。サイズ境界 + バイナリ判定通過の両方を検証。
        make_file_with_bytes(dir.path(), "max.md", &b"a".repeat(1024 * 1024));

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["max.md"]);
    }

    #[test]
    fn scan_md_files_excludes_file_over_max_size() {
        let dir = TempDir::new().unwrap();
        // 1,048,577 byte (1MB + 1 byte)。sparse file で OK（サイズチェックで先に弾かれる）。
        make_file_with_size(dir.path(), "over.md", 1024 * 1024 + 1);

        let result = scan_md_files(dir.path()).unwrap();
        assert!(
            result.is_empty(),
            "1MB+1 byte file should be excluded, got {result:?}"
        );
    }

    #[test]
    fn scan_md_files_excludes_multi_megabyte_file() {
        let dir = TempDir::new().unwrap();
        make_file_with_size(dir.path(), "huge.md", 5 * 1024 * 1024);

        let result = scan_md_files(dir.path()).unwrap();
        assert!(
            result.is_empty(),
            "5MB file should be excluded, got {result:?}"
        );
    }

    // ── バイナリフィルタ（先頭 8KB に NUL byte） ──────────────────

    #[test]
    fn scan_md_files_includes_text_without_nul_byte() {
        let dir = TempDir::new().unwrap();
        make_file_with_bytes(dir.path(), "plain.md", b"hello world");

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["plain.md"]);
    }

    #[test]
    fn scan_md_files_excludes_binary_with_nul_in_probe_range() {
        let dir = TempDir::new().unwrap();
        make_file_with_bytes(dir.path(), "binary.md", b"hello\x00world");

        let result = scan_md_files(dir.path()).unwrap();
        assert!(
            result.is_empty(),
            "binary file with NUL byte should be excluded, got {result:?}"
        );
    }

    #[test]
    fn scan_md_files_excludes_binary_with_nul_at_probe_boundary() {
        let dir = TempDir::new().unwrap();
        // 先頭 8,191 byte 'a' + 8,192 byte 目に NUL → プローブ範囲の最終バイト。
        let mut bytes = vec![b'a'; 8 * 1024 - 1];
        bytes.push(0);
        make_file_with_bytes(dir.path(), "boundary.md", &bytes);

        let result = scan_md_files(dir.path()).unwrap();
        assert!(
            result.is_empty(),
            "NUL byte at probe boundary should still be detected, got {result:?}"
        );
    }

    #[test]
    fn scan_md_files_includes_file_with_nul_after_probe_range() {
        let dir = TempDir::new().unwrap();
        // 先頭 8,192 byte 'a' + 8,193 byte 目以降にのみ NUL → プローブ範囲外。仕様として含める。
        let mut bytes = vec![b'a'; 8 * 1024];
        bytes.push(0);
        bytes.extend_from_slice(b"trailing\x00bytes");
        make_file_with_bytes(dir.path(), "tail-nul.md", &bytes);

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["tail-nul.md"]);
    }

    #[test]
    fn scan_md_files_excludes_small_binary_file() {
        let dir = TempDir::new().unwrap();
        let mut bytes = vec![b'a'; 100];
        bytes[50] = 0;
        make_file_with_bytes(dir.path(), "tiny-bin.md", &bytes);

        let result = scan_md_files(dir.path()).unwrap();
        assert!(
            result.is_empty(),
            "100-byte file with NUL byte should be excluded, got {result:?}"
        );
    }

    #[test]
    fn scan_md_files_includes_empty_file() {
        let dir = TempDir::new().unwrap();
        make_file_with_bytes(dir.path(), "empty.md", b"");

        let result = scan_md_files(dir.path()).unwrap();
        assert_eq!(collect_sorted_relative(&result), vec!["empty.md"]);
    }

    // ── per-entry I/O エラー skip（cfg(unix) 限定） ────────────────

    #[cfg(unix)]
    #[test]
    fn scan_md_files_skips_unreadable_file_silently() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new().unwrap();
        make_file_with_bytes(dir.path(), "readable.md", b"hello");
        make_file_with_bytes(dir.path(), "locked.md", b"secret");

        let locked = dir.path().join("locked.md");
        let mut perms = std::fs::metadata(&locked).unwrap().permissions();
        perms.set_mode(0o000);
        std::fs::set_permissions(&locked, perms).unwrap();

        // uid 0 環境では `chmod 000` でも読めてしまうため、実測してから挙動を分岐させる。
        let locked_is_actually_unreadable = std::fs::File::open(&locked).is_err();
        let result = scan_md_files(dir.path());

        // TempDir クリーンアップ失敗を避けるため必ず権限を復元。
        let mut restore = std::fs::metadata(&locked).unwrap().permissions();
        restore.set_mode(0o644);
        std::fs::set_permissions(&locked, restore).unwrap();

        let result = result.expect("scan should succeed even when one entry is unreadable");
        let collected = collect_sorted_relative(&result);
        if locked_is_actually_unreadable {
            assert_eq!(collected, vec!["readable.md"]);
        } else {
            assert_eq!(collected, vec!["locked.md", "readable.md"]);
        }
    }
}
