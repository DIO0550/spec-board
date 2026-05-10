//! `.spec-board/` ディレクトリ、`config.json`、補助ファイル `GUIDE.md` の
//! ファイル I/O を担うモジュール。
//!
//! 本モジュールはサブクレート `spec-board-fs` の境界規約に従い、
//! 公開 API のシグネチャに外部 crate の型（`serde_json::Error` 等）を出さない。
//! JSON のパースは本体クレート `spec-board` 側の責務とし、本モジュールは
//! 「ディレクトリ作成」「ファイル存在チェック + 文字列読み込み」
//! 「補助ファイル書き込み」までを担当する。
//!
//! # スコープ
//!
//! - [`ensure_spec_board_dir`]: `<project_root>/.spec-board/` を冪等に作成
//! - [`read_config_json`]: `<project_root>/.spec-board/config.json` の中身を文字列で返す
//!   （ファイル不在は `Ok(None)`）
//! - [`guide_markdown_path`]: `<project_root>/.spec-board/GUIDE.md` のパスを返す
//! - [`write_guide_markdown`]: `<project_root>/.spec-board/GUIDE.md` へ文字列を書き込む
//!
//! # スコープ外
//!
//! - `config.json` の書き出し（atomic write / `.bak` 退避）は別モジュール / 別 Issue
//! - JSON のパース / シリアライズは本体クレート側

use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use thiserror::Error;

const SPEC_BOARD_DIR: &str = ".spec-board";
const CONFIG_FILE_NAME: &str = "config.json";
const GUIDE_MARKDOWN_FILE_NAME: &str = "GUIDE.md";
static GUIDE_MARKDOWN_TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

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

/// 指定パスと `std::io::Error` を `ConfigIoError::Io` に包む。
///
/// 呼び出し元の操作種別に関わらず、失敗対象パスを保持するための共通ヘルパー。
///
/// @param path 失敗対象としてエラーに保持する path。
/// @param source 元になった `std::io::Error`。
/// @returns path と source を保持する `ConfigIoError::Io`。
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

/// `<project_root>/.spec-board/GUIDE.md` の絶対パス相当を返す（純粋計算、I/O なし）。
///
/// `project_root` が相対パスなら戻り値も相対パスになる（`canonicalize` は行わない）。
///
/// # Returns
///
/// GUIDE.md の配置先パス。
pub fn guide_markdown_path(project_root: &Path) -> PathBuf {
    project_root
        .join(SPEC_BOARD_DIR)
        .join(GUIDE_MARKDOWN_FILE_NAME)
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

/// `<project_root>/.spec-board/GUIDE.md` へ Markdown 文字列を書き込む。
///
/// 書き込み前に [`ensure_spec_board_dir`] を呼び、`.spec-board/` が無い場合は作成する。
/// 既存 `GUIDE.md` は fresh tmp file へ書いてから `rename` で置き換える。
/// `.spec-board/` または `GUIDE.md` が symlink の場合は、project root 外のファイルを
/// 上書きしないよう拒否する。
///
/// # Errors
///
/// - `project_root` が存在しない / ディレクトリでない / アクセスできない
/// - `<project_root>/.spec-board` がファイルまたは symlink として存在する
/// - `<project_root>/.spec-board/GUIDE.md` が symlink として存在する
/// - 権限不足等で `.spec-board/` 作成または `GUIDE.md` 書き込みが失敗する
pub fn write_guide_markdown(project_root: &Path, content: &str) -> Result<PathBuf, ConfigIoError> {
    let spec_board_dir = ensure_spec_board_dir(project_root)?;
    reject_existing_symlink(&spec_board_dir)?;
    let guide_path = guide_markdown_path(project_root);
    reject_existing_symlink(&guide_path)?;

    let tmp_path = unique_guide_markdown_tmp_path(&spec_board_dir);
    write_file_via_tmp(&guide_path, content, &tmp_path)?;

    Ok(guide_path)
}

fn reject_existing_symlink(path: &Path) -> Result<(), ConfigIoError> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Err(io_err(
            path,
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("{} is a symlink", path.display()),
            ),
        )),
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(io_err(path, e)),
    }
}

fn unique_guide_markdown_tmp_path(spec_board_dir: &Path) -> PathBuf {
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    let counter = GUIDE_MARKDOWN_TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    spec_board_dir.join(format!(
        "{GUIDE_MARKDOWN_FILE_NAME}.tmp.{pid}.{nanos}.{counter}"
    ))
}

fn write_file_via_tmp(dst: &Path, content: &str, tmp: &Path) -> Result<(), ConfigIoError> {
    match std::fs::remove_file(tmp) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(io_err(tmp, e)),
    }

    let mut tmp_file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(tmp)
        .map_err(|e| io_err(tmp, e))?;

    if let Err(e) = tmp_file.write_all(content.as_bytes()) {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(io_err(tmp, e));
    }

    if let Err(e) = tmp_file.sync_all() {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(io_err(tmp, e));
    }

    drop(tmp_file);

    replace_file_with_tmp(tmp, dst).map_err(|e| {
        let _ = std::fs::remove_file(tmp);
        io_err(dst, e)
    })
}

#[cfg(not(windows))]
fn replace_file_with_tmp(tmp: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::rename(tmp, dst)
}

#[cfg(windows)]
fn replace_file_with_tmp(tmp: &Path, dst: &Path) -> std::io::Result<()> {
    match std::fs::rename(tmp, dst) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            replace_existing_file_with_tmp_via_backup(tmp, dst)
        }
        Err(e) => Err(e),
    }
}

#[cfg(windows)]
fn replace_existing_file_with_tmp_via_backup(tmp: &Path, dst: &Path) -> std::io::Result<()> {
    let backup = unique_sibling_path(dst, "bak");
    std::fs::rename(dst, &backup)?;
    match std::fs::rename(tmp, dst) {
        Ok(()) => {
            let _ = std::fs::remove_file(&backup);
            Ok(())
        }
        Err(rename_err) => {
            if let Err(restore_err) = std::fs::rename(&backup, dst) {
                return Err(std::io::Error::new(
                    rename_err.kind(),
                    format!(
                        "failed to replace `{dst}` with `{tmp}` ({rename_err}); \
                         restoring backup `{backup}` also failed: {restore_err}",
                        dst = dst.display(),
                        tmp = tmp.display(),
                        backup = backup.display(),
                    ),
                ));
            }
            Err(rename_err)
        }
    }
}

#[cfg(windows)]
fn unique_sibling_path(base: &Path, suffix: &str) -> PathBuf {
    let pid = std::process::id();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    let counter = GUIDE_MARKDOWN_TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let file_name = base
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let parent = base.parent().unwrap_or_else(|| Path::new(""));
    parent.join(format!("{file_name}.{suffix}.{pid}.{nanos}.{counter}"))
}

/// 指定パスが存在するディレクトリであることを検証する。
///
/// @param path 検証対象の path。
/// @returns path が存在するディレクトリなら `Ok(())`、不在・アクセス不可・非ディレクトリなら `ConfigIoError`。
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
#[path = "config_io_tests.rs"]
mod config_io_tests;
