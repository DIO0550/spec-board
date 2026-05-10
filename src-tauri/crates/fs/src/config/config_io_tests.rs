use super::*;
use tempfile::TempDir;

// ───────── ensure_spec_board_dir ─────────

#[test]
fn ensure_spec_board_dir_creates_dir_when_absent() {
    let tmp = TempDir::new().unwrap();
    let result = ensure_spec_board_dir(tmp.path()).unwrap();
    assert_eq!(result, tmp.path().join(".spec-board"));
    assert!(result.is_dir());
}

#[test]
fn ensure_spec_board_dir_is_idempotent_when_dir_exists() {
    let tmp = TempDir::new().unwrap();
    let existing = tmp.path().join(".spec-board");
    std::fs::create_dir(&existing).unwrap();
    // マーカーファイルを置き、no-op であることを確認する
    std::fs::write(existing.join("marker.txt"), b"keep me").unwrap();

    let result = ensure_spec_board_dir(tmp.path()).unwrap();
    assert_eq!(result, existing);
    assert!(
        existing.join("marker.txt").exists(),
        "既存ディレクトリの中身が消えてはならない"
    );
}

#[test]
fn ensure_spec_board_dir_returns_err_when_path_is_file() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join(".spec-board");
    std::fs::write(&path, b"not a directory").unwrap();

    let err = ensure_spec_board_dir(tmp.path()).unwrap_err();
    let ConfigIoError::Io { path: err_path, .. } = err;
    assert_eq!(err_path, path);
}

#[test]
fn ensure_spec_board_dir_returns_err_when_project_root_missing() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("does-not-exist");

    let err = ensure_spec_board_dir(&missing).unwrap_err();
    let ConfigIoError::Io { path, source } = err;
    assert_eq!(path, missing);
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
}

#[cfg(unix)]
#[test]
fn ensure_spec_board_dir_returns_err_when_project_root_unreadable() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = TempDir::new().unwrap();
    let root = tmp.path().join("locked");
    std::fs::create_dir(&root).unwrap();
    // umask / TempDir 実装差を吸収するため、復元用に元の Permissions を捕捉してから
    // chmod 000 する（hardcoded 0o755 だと TempDir が作成した 0o700 等とずれて
    // クリーンアップが flaky になる）。
    let original = std::fs::metadata(&root).unwrap().permissions();
    let mut perms = original.clone();
    perms.set_mode(0o000);
    std::fs::set_permissions(&root, perms).unwrap();

    let actually_writable = std::fs::create_dir(root.join("__probe")).is_ok();
    // probe のクリーンアップは最後にまとめる
    let result = ensure_spec_board_dir(&root);

    std::fs::set_permissions(&root, original).unwrap();
    let _ = std::fs::remove_dir_all(root.join("__probe"));

    match (actually_writable, result) {
        (false, Err(ConfigIoError::Io { path, source })) => {
            // 実装は project_root の metadata は通る (chmod 000 でも親が読めれば metadata 自体は OK)
            // → create_dir_all で PermissionDenied になる想定
            assert!(
                path == root || path == root.join(".spec-board"),
                "想定パス以外: {path:?}"
            );
            assert_eq!(source.kind(), std::io::ErrorKind::PermissionDenied);
        }
        (false, Ok(unexpected)) => {
            panic!("PermissionDenied 期待だが Ok({unexpected:?})")
        }
        (true, _) => {
            // uid 0 等で実際に書き込めてしまう環境では何もチェックしない
        }
    }
}

// ───────── read_config_json ─────────

#[test]
fn read_config_json_returns_none_when_config_absent() {
    let tmp = TempDir::new().unwrap();
    std::fs::create_dir(tmp.path().join(".spec-board")).unwrap();

    let result = read_config_json(tmp.path()).unwrap();
    assert_eq!(result, None);
}

#[test]
fn read_config_json_returns_content_when_present() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let content = r#"{"version":1,"columns":[],"cardOrder":{}}"#;
    std::fs::write(dir.join("config.json"), content).unwrap();

    let result = read_config_json(tmp.path()).unwrap();
    assert_eq!(result.as_deref(), Some(content));
}

#[test]
fn write_guide_markdown_creates_spec_board_dir_and_file_when_absent() {
    let tmp = TempDir::new().unwrap();
    let content = "# Guide\n";

    let path = write_guide_markdown(tmp.path(), content).unwrap();

    assert_eq!(path, tmp.path().join(".spec-board").join("GUIDE.md"));
    assert_eq!(std::fs::read_to_string(path).unwrap(), content);
}

#[test]
fn write_guide_markdown_overwrites_existing_file() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let path = dir.join("GUIDE.md");
    std::fs::write(&path, "old").unwrap();

    let written_path = write_guide_markdown(tmp.path(), "new").unwrap();

    assert_eq!(written_path, path);
    assert_eq!(std::fs::read_to_string(path).unwrap(), "new");
}

#[cfg(unix)]
#[test]
fn write_guide_markdown_rejects_spec_board_symlink_without_writing_target() {
    use std::os::unix::fs::symlink;

    let tmp = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let outside_guide = outside.path().join("GUIDE.md");
    symlink(outside.path(), tmp.path().join(".spec-board")).unwrap();

    let err = write_guide_markdown(tmp.path(), "new").unwrap_err();

    let ConfigIoError::Io { path, source } = err;
    assert_eq!(path, tmp.path().join(".spec-board"));
    assert_eq!(source.kind(), std::io::ErrorKind::InvalidInput);
    assert!(source.to_string().contains("is a symlink"));
    assert!(!outside_guide.exists());
}

#[cfg(unix)]
#[test]
fn write_guide_markdown_rejects_guide_symlink_without_overwriting_target() {
    use std::os::unix::fs::symlink;

    let tmp = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let target = outside.path().join("target.txt");
    std::fs::write(&target, "keep").unwrap();
    let guide_path = dir.join("GUIDE.md");
    symlink(&target, &guide_path).unwrap();

    let err = write_guide_markdown(tmp.path(), "new").unwrap_err();

    let ConfigIoError::Io { path, source } = err;
    assert_eq!(path, guide_path);
    assert_eq!(source.kind(), std::io::ErrorKind::InvalidInput);
    assert!(source.to_string().contains("is a symlink"));
    assert_eq!(std::fs::read_to_string(target).unwrap(), "keep");
}

#[cfg(unix)]
#[test]
fn write_guide_markdown_replaces_hard_link_without_overwriting_target_inode() {
    let tmp = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let target = outside.path().join("target.txt");
    std::fs::write(&target, "keep").unwrap();
    let guide_path = dir.join("GUIDE.md");
    std::fs::hard_link(&target, &guide_path).unwrap();

    let written_path = write_guide_markdown(tmp.path(), "new").unwrap();

    assert_eq!(written_path, guide_path);
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "keep");
    assert_eq!(std::fs::read_to_string(guide_path).unwrap(), "new");
}

#[test]
fn guide_markdown_path_returns_spec_board_guide_path() {
    let root = Path::new("/project");

    let path = guide_markdown_path(root);

    assert_eq!(
        path,
        Path::new("/project").join(".spec-board").join("GUIDE.md")
    );
}

#[test]
fn read_config_json_returns_invalid_json_as_raw_string() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let raw = "{not valid json";
    std::fs::write(dir.join("config.json"), raw).unwrap();

    let result = read_config_json(tmp.path()).unwrap();
    assert_eq!(result.as_deref(), Some(raw));
}

#[test]
fn read_config_json_returns_err_when_project_root_missing() {
    let tmp = TempDir::new().unwrap();
    let missing = tmp.path().join("does-not-exist");

    let err = read_config_json(&missing).unwrap_err();
    let ConfigIoError::Io { path, .. } = err;
    assert_eq!(path, missing);
}

#[test]
fn read_config_json_returns_err_when_spec_board_dir_missing() {
    let tmp = TempDir::new().unwrap();
    let err = read_config_json(tmp.path()).unwrap_err();
    let ConfigIoError::Io { path, source } = err;
    assert_eq!(path, tmp.path().join(".spec-board"));
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
}

#[test]
fn read_config_json_returns_err_when_spec_board_dir_is_file() {
    let tmp = TempDir::new().unwrap();
    let path = tmp.path().join(".spec-board");
    std::fs::write(&path, b"not a directory").unwrap();

    let err = read_config_json(tmp.path()).unwrap_err();
    let ConfigIoError::Io { path: err_path, .. } = err;
    assert_eq!(err_path, path);
}

#[test]
fn read_config_json_returns_err_when_config_is_directory() {
    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let config_as_dir = dir.join("config.json");
    std::fs::create_dir(&config_as_dir).unwrap();

    let err = read_config_json(tmp.path()).unwrap_err();
    let ConfigIoError::Io { path, source } = err;
    assert_eq!(path, config_as_dir);
    assert_eq!(source.kind(), std::io::ErrorKind::IsADirectory);
}

#[cfg(unix)]
#[test]
fn read_config_json_returns_err_when_config_is_dangling_symlink() {
    use std::os::unix::fs::symlink;

    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let config_path = dir.join("config.json");
    // 存在しないターゲットへの symlink（= dangling symlink）
    symlink(tmp.path().join("does-not-exist.json"), &config_path).unwrap();

    let err = read_config_json(tmp.path()).unwrap_err();
    let ConfigIoError::Io { path, source } = err;
    assert_eq!(path, config_path);
    // dangling symlink を Ok(None) と誤認しないこと（NotFound は来るが Err として伝播）
    assert_eq!(source.kind(), std::io::ErrorKind::NotFound);
}

#[cfg(unix)]
#[test]
fn read_config_json_returns_err_when_config_is_unreadable() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = TempDir::new().unwrap();
    let dir = tmp.path().join(".spec-board");
    std::fs::create_dir(&dir).unwrap();
    let config_path = dir.join("config.json");
    std::fs::write(&config_path, b"{}").unwrap();

    // umask / OS 差を吸収するため、復元用に元の Permissions を捕捉してから
    // chmod 000 する（hardcoded 0o644 だと環境によって設定モードと不一致）。
    let original = std::fs::metadata(&config_path).unwrap().permissions();
    let mut perms = original.clone();
    perms.set_mode(0o000);
    std::fs::set_permissions(&config_path, perms).unwrap();

    let actually_readable = std::fs::read_to_string(&config_path).is_ok();
    let result = read_config_json(tmp.path());

    std::fs::set_permissions(&config_path, original).unwrap();

    match (actually_readable, result) {
        (false, Err(ConfigIoError::Io { path, source })) => {
            assert_eq!(path, config_path);
            assert_eq!(source.kind(), std::io::ErrorKind::PermissionDenied);
        }
        (false, Ok(unexpected)) => {
            panic!("PermissionDenied 期待だが Ok({unexpected:?})")
        }
        (true, _) => {
            // uid 0 環境では権限を無視できるためチェックしない
        }
    }
}
