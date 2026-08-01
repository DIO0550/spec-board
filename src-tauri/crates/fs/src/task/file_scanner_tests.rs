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

// ── structured warnings ─────────────────────────────────────────

#[test]
fn scan_md_files_with_warnings_reports_rejected_entries() {
    let dir = TempDir::new().unwrap();
    make_file_with_bytes(dir.path(), "ok.md", b"ok");
    make_file_with_bytes(dir.path(), "binary.md", b"hello\x00world");
    make_file_with_size(dir.path(), "too-large.md", 1024 * 1024 + 1);

    let outcome = scan_md_files_with_warnings(dir.path()).unwrap();

    assert_eq!(collect_sorted_relative(&outcome.items), vec!["ok.md"]);
    assert!(outcome.warnings.iter().any(|warning| {
        warning.code == ScanWarningCode::BinaryFile && warning.path.as_deref() == Some("binary.md")
    }));
    assert!(outcome.warnings.iter().any(|warning| {
        warning.code == ScanWarningCode::FileTooLarge
            && warning.path.as_deref() == Some("too-large.md")
    }));
}

#[cfg(unix)]
#[test]
fn scan_md_files_with_warnings_reports_invalid_utf8_paths() {
    use std::ffi::OsString;
    use std::os::unix::ffi::OsStringExt;

    let dir = TempDir::new().unwrap();
    let invalid_name = OsString::from_vec(b"invalid\xff.md".to_vec());
    std::fs::write(dir.path().join(&invalid_name), b"content").unwrap();

    let outcome = scan_md_files_with_warnings(dir.path()).unwrap();

    assert!(outcome.items.is_empty());
    assert!(outcome
        .warnings
        .iter()
        .any(|warning| { warning.code == ScanWarningCode::InvalidPath && warning.path.is_none() }));
}

#[cfg(unix)]
#[test]
fn scan_md_files_with_warnings_reports_unreadable_files_when_os_denies_read() {
    use std::os::unix::fs::PermissionsExt;

    let dir = TempDir::new().unwrap();
    make_file_with_bytes(dir.path(), "locked.md", b"secret");
    let locked = dir.path().join("locked.md");
    let mut permissions = std::fs::metadata(&locked).unwrap().permissions();
    permissions.set_mode(0o000);
    std::fs::set_permissions(&locked, permissions).unwrap();
    let actually_unreadable = std::fs::File::open(&locked).is_err();

    let outcome = scan_md_files_with_warnings(dir.path());

    let mut restore = std::fs::metadata(&locked).unwrap().permissions();
    restore.set_mode(0o644);
    std::fs::set_permissions(&locked, restore).unwrap();

    let outcome = outcome.unwrap();
    if actually_unreadable {
        assert!(outcome.warnings.iter().any(|warning| {
            warning.code == ScanWarningCode::UnreadableFile
                && warning.path.as_deref() == Some("locked.md")
        }));
    } else {
        assert_eq!(collect_sorted_relative(&outcome.items), vec!["locked.md"]);
    }
}

#[test]
fn scan_md_files_with_warnings_keeps_root_errors_fatal() {
    let dir = TempDir::new().unwrap();
    let missing = dir.path().join("missing");

    let error = scan_md_files_with_warnings(&missing).unwrap_err();

    assert!(matches!(error, ScanError::Io { .. }));
}
