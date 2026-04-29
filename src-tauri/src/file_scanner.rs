use std::path::{Path, PathBuf};
use thiserror::Error;

/// 指定ディレクトリ配下の `.md` ファイルを再帰的に列挙する。
///
/// - 拡張子 `.md` の判定は大文字小文字を区別しない（`.MD` / `.Md` / `.mD` も対象）
/// - 先頭が `.` のディレクトリ・ファイル（`.git` / `.vscode` / `.DS_Store` / `.hidden.md` 等）は除外
/// - ディレクトリ名が `node_modules` のものは深さを問わず除外
/// - シンボリックリンクは辿らない（リンク先は走査しない）
/// - 非 UTF-8 のパスを含むエントリは保守的に除外（後続の Tauri / JSON 境界で扱えないため）
/// - ファイル単位の I/O エラー（権限不足等）は黙って skip し、走査を継続する
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
        if entry.depth() == 0 {
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        if !is_md_extension(path) {
            continue;
        }
        let file_name_starts_with_dot = path
            .file_name()
            .and_then(|s| s.to_str())
            .map(|name| name.starts_with('.'))
            .unwrap_or(true);
        if file_name_starts_with_dot {
            continue;
        }
        let rel = match path.strip_prefix(root) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if rel.to_str().is_none() {
            continue;
        }
        results.push(rel.to_path_buf());
    }

    Ok(results)
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
}
