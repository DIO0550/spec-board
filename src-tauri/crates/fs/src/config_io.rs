//! `.spec-board/` ディレクトリと `config.json` のファイル I/O を担うモジュール。
//!
//! 本モジュールはサブクレート `spec-board-fs` の境界規約に従い、
//! 公開 API のシグネチャに外部 crate の型（`serde_json::Error` 等）を出さない。
//! JSON のパースは本体クレート `spec-board` 側の責務とし、本モジュールは
//! 「ディレクトリ作成」「ファイル存在チェック + 文字列読み込み」までを担当する。
//!
//! # スコープ
//!
//! - [`ensure_spec_board_dir`]: `<project_root>/.spec-board/` を冪等に作成
//! - [`read_config_json`]: `<project_root>/.spec-board/config.json` の中身を文字列で返す
//!   （ファイル不在は `Ok(None)`）
//!
//! # スコープ外
//!
//! - `config.json` の書き出し（atomic write / `.bak` 退避）は別モジュール / 別 Issue
//! - JSON のパース / シリアライズは本体クレート側

use std::path::{Path, PathBuf};

use thiserror::Error;

const SPEC_BOARD_DIR: &str = ".spec-board";
const CONFIG_FILE_NAME: &str = "config.json";

/// `config_io` モジュールのファイル I/O で発生し得るエラー。
///
/// `path` には失敗時の対象パスのコピーを保持し、エラー文脈を残す
/// （OS のエラーメッセージだけではどのパスで失敗したか不明になるため）。
/// `.spec-board/` ディレクトリへのアクセス / 作成と `config.json` の読み込みの
/// 両方で同じバリアントを使うため、メッセージは特定操作に偏らない汎用文言とする。
#[derive(Debug, Error)]
pub enum ConfigIoError {
    /// 致命的 I/O エラー（ディレクトリ作成 / `is_dir` チェック / ファイル読み込みなど）。
    /// `path` は失敗対象のパス（`.spec-board/` ディレクトリ自身 / `config.json` ファイル
    /// のいずれか）。詳細は `source` の `std::io::ErrorKind` を参照。
    #[error("config_io: I/O error at `{path}`: {source}", path = path.display())]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

fn io_err(path: &Path, source: std::io::Error) -> ConfigIoError {
    ConfigIoError::Io {
        path: path.to_path_buf(),
        source,
    }
}

/// `<project_root>/.spec-board/config.json` の絶対パス相当を返す（純粋計算、I/O なし）。
///
/// 呼び出し側がエラー文脈用にパス文字列を再構築する際の「真の正典」として使うことで、
/// `.spec-board` / `config.json` の名前定数を本モジュールに一本化する。
/// `project_root` が相対パスなら戻り値も相対パスになる（`canonicalize` は行わない）。
pub fn config_path(project_root: &Path) -> PathBuf {
    project_root.join(SPEC_BOARD_DIR).join(CONFIG_FILE_NAME)
}

/// `<project_root>/.spec-board/` を冪等に作成し、その `PathBuf` を返す。
///
/// 既に存在する場合は何もせず成功扱い（`std::fs::create_dir_all` のセマンティクス）。
///
/// 戻り値は `project_root.join(".spec-board")` の素朴な join 結果であり、
/// `project_root` が相対パスなら戻り値も相対パスになる（`canonicalize` は行わない）。
/// 絶対パスが必要な場合は呼び出し側が `project_root` を絶対パスで渡すこと。
///
/// # Errors
///
/// - `project_root` が存在しない / アクセスできない
/// - `<project_root>/.spec-board` が **ファイル**として存在する（`is_dir() == false`）
/// - 権限不足等で `create_dir_all` が失敗する
pub fn ensure_spec_board_dir(project_root: &Path) -> Result<PathBuf, ConfigIoError> {
    let root_meta = std::fs::metadata(project_root).map_err(|e| io_err(project_root, e))?;
    if !root_meta.is_dir() {
        return Err(io_err(
            project_root,
            std::io::Error::from(std::io::ErrorKind::NotADirectory),
        ));
    }

    let spec_board_dir = project_root.join(SPEC_BOARD_DIR);

    match std::fs::metadata(&spec_board_dir) {
        Ok(meta) => {
            if !meta.is_dir() {
                return Err(io_err(
                    &spec_board_dir,
                    std::io::Error::from(std::io::ErrorKind::NotADirectory),
                ));
            }
            Ok(spec_board_dir)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir_all(&spec_board_dir).map_err(|e| io_err(&spec_board_dir, e))?;
            Ok(spec_board_dir)
        }
        Err(e) => Err(io_err(&spec_board_dir, e)),
    }
}

/// `<project_root>/.spec-board/config.json` の中身を `String` で読み込む。
///
/// - `config.json` が存在しない場合のみ `Ok(None)` を返す（呼び出し側で
///   Default 初期化に分岐するため）。
/// - 読み取りに成功した場合は `Ok(Some(content))` を返す。中身が不正 JSON でも
///   本モジュールでは検査せず、生の文字列として返す（パースは本体クレートの責務）。
///
/// # 前提条件
///
/// `project_root` および `<project_root>/.spec-board/` は呼び出し側で
/// 事前に存在を保証してから渡すこと（通常は [`ensure_spec_board_dir`] を
/// 直前に呼ぶ）。
///
/// 実装は防御的に内部で `<project_root>/.spec-board/` の存在 + ディレクトリ性も
/// 検査する：
///
/// - `project_root` 不在 / `<project_root>/.spec-board/` 不在 / どちらかが
///   ディレクトリでない場合は `Err(ConfigIoError::Io)` を返す（`Ok(None)` には
///   しない。「設定ファイル不在」と「環境異常」を呼び出し側で区別可能にするため）
/// - `Ok(None)` を返すのは「`.spec-board/` は存在 + `config.json` のみ不在」
///   の正常系のみ
///
/// # Errors
///
/// - `project_root` 不在 / アクセス不可 / ディレクトリでない
/// - `<project_root>/.spec-board/` 不在 / アクセス不可 / ディレクトリでない
/// - 権限不足等で `read_to_string` が失敗する場合
/// - `<project_root>/.spec-board/config.json` がディレクトリとして存在する等の異常ケース
/// - `<project_root>/.spec-board/config.json` が壊れた symlink（dangling symlink）として
///   存在する場合（`Ok(None)` には**しない**。dir entry は存在するため「設定ファイル
///   不在」ではなく環境異常として扱う）
pub fn read_config_json(project_root: &Path) -> Result<Option<String>, ConfigIoError> {
    validate_dir(project_root)?;
    let spec_board_dir = project_root.join(SPEC_BOARD_DIR);
    validate_dir(&spec_board_dir)?;

    let config_path = config_path(project_root);

    // dir entry の存在は `symlink_metadata` で先に確認する。`metadata` は
    // symlink を辿るため、dangling symlink (リンク先が消えた状態) を
    // `NotFound` として `Ok(None)` 扱いしてしまうが、これは「設定ファイル
    // 不在」ではなく環境異常（壊れた symlink）として `Err(Io)` を返したい。
    if let Err(e) = std::fs::symlink_metadata(&config_path) {
        return if e.kind() == std::io::ErrorKind::NotFound {
            Ok(None)
        } else {
            Err(io_err(&config_path, e))
        };
    }

    // symlink_metadata が成功 = dir entry は存在する。ここで `metadata` が
    // `NotFound` を返すのは dangling symlink のときのみ。
    // 「壊れた symlink」を `Ok(None)` にしないため、`Err` として伝播する。
    let meta = std::fs::metadata(&config_path).map_err(|e| io_err(&config_path, e))?;
    if !meta.is_file() {
        // ディレクトリの場合は `IsADirectory`、それ以外の非ファイル（特殊ファイル等）は
        // `InvalidInput` を返す。呼び出し側が `ErrorKind` で分岐できるよう明示する。
        let kind = if meta.is_dir() {
            std::io::ErrorKind::IsADirectory
        } else {
            std::io::ErrorKind::InvalidInput
        };
        return Err(io_err(&config_path, std::io::Error::from(kind)));
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| io_err(&config_path, e))?;
    Ok(Some(content))
}

fn validate_dir(path: &Path) -> Result<(), ConfigIoError> {
    let meta = std::fs::metadata(path).map_err(|e| io_err(path, e))?;
    if !meta.is_dir() {
        return Err(io_err(
            path,
            std::io::Error::from(std::io::ErrorKind::NotADirectory),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
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
}
