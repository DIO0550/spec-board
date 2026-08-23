//! `.spec-board/config.json` の読み込みと低レベル atomic write インフラ。
//!
//! 低レベル I/O（`.spec-board/` の作成、`config.json` の raw 読み込み / 書き出し）は
//! サブクレート `spec_board_fs::config::config_io` に集約する。本モジュールは
//! その raw 文字列を解釈し、薄い責務に留める:
//!
//! - 軽量スキーマ [`VersionOnly`] を `serde_json::from_str` で適用して `version` を
//!   line/col 付きで取り出す
//! - 現行 version の場合は `serde_json::from_str::<Config>` で **直接** デシリアライズ
//!   し schema mismatch のエラーも line/col を保持する
//! - 古い version の場合のみ `serde_json::Value` を materialize し、`config.json.bak`
//!   へのバックアップ → [`crate::config::migration::migrate_config`] →
//!   `serde_json::from_value::<Config>` の経路で legacy フォーマットを取り込む
//! - 未来 version は [`LoadConfigError::UnknownFutureVersion`] で停止
//! - 不在時の `Default` フォールバック
//! - load 時のカラム名重複検証と空 columns 拒否
//!
//! また、`update_columns` などが `config.json` を atomic write するための
//! [`ConfigWriter`] ポートと本番実装 [`FsConfigWriter`]、共通の
//! [`write_atomic_to_path`] / [`unique_atomic_tmp_path`] を提供する。

use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use serde::Deserialize;
use spec_board_fs::config::config_io::{self, ConfigIoError};
use thiserror::Error;

use crate::config::core::{validate_unique_column_names, Config};
use crate::config::migration::{migrate_config, MigrationError};
use crate::config::schema_version::SchemaVersion;

/// [`load_persisted`] / [`load_or_default`] で発生し得るエラー。
///
/// [`ConfigIoError`] は `#[from]` で透過的に伝播し、JSON パース失敗は
/// 本層で [`LoadConfigError::Parse`] に包んで返す
/// （境界規約: パースは本体クレートの責務）。
#[derive(Debug, Error)]
pub enum LoadConfigError {
    #[error(transparent)]
    Io(#[from] ConfigIoError),

    #[error("failed to parse config.json at `{path}`: {source}", path = path.display())]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },

    #[error(
        "unknown future config.json version at `{path}`: found {found}, supported up to {supported}",
        path = path.display()
    )]
    UnknownFutureVersion {
        path: PathBuf,
        found: u32,
        supported: u32,
    },

    #[error(
        "duplicate column name in config.json at `{path}`: `{name}`",
        path = path.display()
    )]
    DuplicateColumnName { path: PathBuf, name: String },

    #[error(
        "config.json at `{path}` must contain at least one column, but `columns` is empty",
        path = path.display()
    )]
    EmptyColumns { path: PathBuf },

    #[error(
        "config.json migration at `{path}` failed: {source}",
        path = path.display()
    )]
    MigrationFailed {
        path: PathBuf,
        #[source]
        source: MigrationError,
    },

    #[error("failed to write backup `{path}`: {source}", path = path.display())]
    BackupFailed {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}

/// `<project_root>/.spec-board/config.json.bak` に `content` を書き出す。
///
/// caller が既に読み込み済みの raw 文字列 `content` をそのまま書き出すため、
/// 「config.json を読み込み → migrate → caller に Config を返す」流れの間に
/// 外部エディタが `config.json` を書き換えても、`.bak` の内容は parse に使った
/// `content` と一致することが保証される（TOCTOU 回避）。
///
/// # 書き出し戦略: sterilized tempfile + atomic rename
///
/// 1. **tmp パス名の unique 化**: `<dst>.tmp.{pid}.{nanos}.{counter}` 形式で
///    呼び出しごとに異なる名前を採用する。`counter` は process-local AtomicU64 で
///    fetch_add するため同一プロセス内 / 粗い時計分解能下でも一意性が保証され、
///    同じ project_root に対する並行 `load_persisted` 呼び出しが同一の tmp ファイルを
///    奪い合って干渉する race を回避できる（ベストエフォート — lockfile 自体は
///    本関数の範囲外）。
/// 2. **tmp パスの sterilization**: 上記 tmp パスを一旦 `unlink` してから
///    `OpenOptions::create_new(true)`（`O_CREAT|O_EXCL` 相当）で開く。
///    これにより:
///    - 攻撃者が事前に tmp パスを symlink / hard link として作成していても、
///      `unlink` でディレクトリエントリだけを削除し（symlink 自体やリンク数のみを
///      減らし、リンク先 / inode は破壊しない）、続く `create_new` で完全に新しい
///      inode を作る。`std::fs::write` を直接使うと事前に作られた symlink を辿って
///      外部ファイルを破壊する経路があったが、本フローでは閉じる。
///    - クラッシュ等で残った stale tmp も自動的に再作成される。
/// 2. **書き出し**: 上記で開いた fresh inode に `content` を書き込む。
/// 3. **atomic `rename(<dst>.tmp, <dst>)`**: 既存 `<dst>` が hard link でも
///    symlink でも通常ファイルでも、ディレクトリエントリだけを差し替えて
///    inode は触らない。これにより既存 `<dst>` 経由での外部ファイル truncate も
///    防げる。
///
/// # symlink 防御の範囲
///
/// 書き出し前に **`<project_root>/.spec-board/` ディレクトリ** および **`config.json.bak`
/// の leaf** の双方が symlink でないことを `symlink_metadata` で確認し、いずれかが
/// symlink の場合は [`LoadConfigError::BackupFailed`] を返して書き出しを拒否する。
/// 上記の sterilized tmp + rename 戦略と併せ、symlink 経由・hard link 経由いずれの
/// 方法でも外部ファイルが上書きされないようにするベストエフォート防御。
///
/// 以下は **本関数の範囲外**であり、lockfile / project-root 内制限など
/// 別レイヤの責務とする:
/// - `<project_root>` 自身およびそれより外側 ancestor の symlink / hard link
/// - 本関数のチェックと write / rename の間に発生する TOCTOU race
///   （leaf / `.spec-board/` / `<dst>.tmp` の親方向が swap された場合）
fn backup_config_json(project_root: &Path, content: &str) -> Result<(), LoadConfigError> {
    let spec_board_dir = config_io::config_path(project_root)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_root.join(".spec-board"));

    if let Ok(meta) = std::fs::symlink_metadata(&spec_board_dir) {
        if meta.file_type().is_symlink() {
            return Err(LoadConfigError::BackupFailed {
                path: spec_board_dir,
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    ".spec-board directory is a symlink",
                ),
            });
        }
    }

    let dst = spec_board_dir.join("config.json.bak");

    if let Ok(meta) = std::fs::symlink_metadata(&dst) {
        if meta.file_type().is_symlink() {
            return Err(LoadConfigError::BackupFailed {
                path: dst,
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "backup destination is a symlink",
                ),
            });
        }
    }

    // tmp ファイル名を呼び出しごとに unique にして並行 load 時の race を回避する。
    // PID + nanos だけでは同一プロセス内 / 粗い時計分解能の環境で collision しうるため、
    // process-local AtomicU64 counter も組み合わせて in-process での一意性を担保する
    // （プロセス境界をまたぐケースは PID で分離）。lockfile による完全な並行制御は
    // 本関数の範囲外。
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    let tmp = spec_board_dir.join(format!("config.json.bak.tmp.{pid}.{nanos}.{counter}"));

    write_atomic_to_path(&dst, content, &tmp).map_err(|source| LoadConfigError::BackupFailed {
        path: dst.clone(),
        source,
    })
}

/// `backup_config_json` 内の tmp パス生成で使う process-local 連番カウンタ。
/// 同一プロセス内で並行に呼ばれても tmp パスの衝突を防ぐ。
static TMP_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// `tmp` に `content` を書き出してから `rename(tmp, dst)` で atomic に置き換える低レベル io 関数。
///
/// 本関数は **`tmp` パスをパラメータとして受け取る**ため、テストから固定パス
/// （例: `config.json.bak.tmp`）を渡して unlink + create_new 防御を直接 exercise できる。
/// プロダクションコードは呼び出し側が `pid + nanos + counter` から派生した unique パスを渡す。
///
/// # 手順
///
/// 1. **tmp の sterilization**: `tmp` を `unlink` する（symlink / hard link なら
///    ディレクトリエントリだけ除去、リンク先 / inode は破壊しない）。
/// 2. `OpenOptions::create_new(true)` (= `O_CREAT | O_EXCL`) で fresh inode を atomic に作成。
/// 3. `write_all` で `content` を書き込み。失敗時は tmp ファイルを best-effort で削除して
///    orphan ガベージを残さない。
/// 4. `rename(tmp, dst)` で atomic 置換。失敗時も tmp を best-effort 削除。
///
/// 戻り値の `io::Result<()>` をどう詰め替えるかは呼び出し側の責務。
/// `backup_config_json` は [`LoadConfigError::BackupFailed`] に、
/// `update_columns` 経路は `UpdateColumnsError::ConfigWriteFailed` に詰める。
pub(crate) fn write_atomic_to_path(dst: &Path, content: &str, tmp: &Path) -> std::io::Result<()> {
    use std::io::Write as _;

    match std::fs::remove_file(tmp) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(source) => return Err(source),
    }

    let mut tmp_file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(tmp)?;
    if let Err(source) = tmp_file.write_all(content.as_bytes()) {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(source);
    }
    if let Err(source) = tmp_file.sync_all() {
        drop(tmp_file);
        let _ = std::fs::remove_file(tmp);
        return Err(source);
    }
    drop(tmp_file);

    std::fs::rename(tmp, dst).inspect_err(|_| {
        let _ = std::fs::remove_file(tmp);
    })
}

/// `update_columns` などが `config.json` を atomic write するためのポート。
///
/// 本番実装は [`FsConfigWriter`]。テストでは failure injection 用の mock を実装する。
pub trait ConfigWriter {
    /// `dst` に `content` を atomic に書き出す。
    ///
    /// # Errors
    ///
    /// - 中間 tmp ファイルの作成 / 書き込み / sync / rename に失敗した場合
    ///   `std::io::Error` を返す。
    fn write_atomic(&self, dst: &Path, content: &str) -> std::io::Result<()>;
}

/// 本番実装。内部で [`write_atomic_to_path`] と [`unique_atomic_tmp_path`] を呼ぶ。
pub struct FsConfigWriter;

impl ConfigWriter for FsConfigWriter {
    fn write_atomic(&self, dst: &Path, content: &str) -> std::io::Result<()> {
        let tmp = unique_atomic_tmp_path(dst);
        write_atomic_to_path(dst, content, &tmp)
    }
}

/// `<dst>` に対して呼び出しごとに unique な tmp パスを生成する。
///
/// `update_columns` から `config.json` の atomic write を行う際にも使用するため
/// pub(crate) 公開。`backup_config_json` 内の tmp 命名規約と同じ形式
/// （`{dst}.tmp.{pid}.{nanos}.{counter}`）を共有し、
/// process-local AtomicU64 counter で in-process 一意性を担保する。
pub(crate) fn unique_atomic_tmp_path(dst: &Path) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let counter = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();

    let file_name = dst
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("atomic");
    let tmp_name = format!("{file_name}.tmp.{pid}.{nanos}.{counter}");

    match dst.parent() {
        Some(parent) => parent.join(tmp_name),
        None => PathBuf::from(tmp_name),
    }
}

/// orphan tmp を削除対象とみなす経過時間の閾値（ナノ秒, 1 時間）。
const STALE_TMP_THRESHOLD_NANOS: u128 = 60 * 60 * 1_000_000_000;

/// `<project_root>/.spec-board/` 配下に残っている orphan `config.json.bak.tmp.*`
/// を best-effort で削除する。
///
/// クラッシュ / 強制終了等で `backup_config_json` の `open(tmp)` と `rename(tmp, dst)`
/// の間で実行が中断された場合、unique tmp 名のため後続 load では再利用 / cleanup されず
/// `.spec-board/` に蓄積する。本関数は `load_persisted` の冒頭で呼ばれる。
///
/// # 安全条件
///
/// - **`<root>/.spec-board/` が symlink の場合は何もしない**。symlink された外部
///   ディレクトリ内の `config.json.bak.tmp.*` を巻き込み削除する経路を塞ぐ。
///   （`backup_config_json` 側でも `.spec-board/` の symlink を弾いており、本関数も
///   同等の防御をかけることで一貫性を確保）。
/// - **「閾値以上古い」 orphan のみ削除**。tmp 名末尾の `{nanos}` を読み、現在時刻との
///   差が [`STALE_TMP_THRESHOLD_NANOS`]（1 時間）を超える tmp のみが削除対象。
///   これにより同一 / 別プロセスで進行中の concurrent load が作った直後の live tmp は
///   温存され、`rename` 直前に他の load から unlink される race を回避する。
/// - 通常ファイル相当の `remove_file` を使うため symlink / hard link でもディレクトリ
///   エントリだけを除去し、リンク先 / 共有 inode は破壊しない。
///
/// I/O エラー（読み取り権限なし等）は無視する — orphan が残っても機能上の支障は
/// 発生せず、次回成功した load で再試行されるため。
fn cleanup_stale_backup_tmps(project_root: &Path) {
    let spec_board_dir = config_io::config_path(project_root)
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| project_root.join(".spec-board"));

    // `.spec-board/` 自体が symlink なら巻き込み削除を避ける。
    if let Ok(meta) = std::fs::symlink_metadata(&spec_board_dir) {
        if meta.file_type().is_symlink() {
            return;
        }
    }

    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(u128::MAX);

    let Ok(entries) = std::fs::read_dir(&spec_board_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name_str) = name.to_str() else {
            continue;
        };
        let Some(rest) = name_str.strip_prefix("config.json.bak.tmp.") else {
            continue;
        };
        // 期待形式: 厳密に "{pid}.{nanos}.{counter}" の 3 整数。それ以外（無関係な
        // `config.json.bak.tmp.note.0.keep` 等）は backup tmp ではないとみなして
        // 温存する。
        let mut parts = rest.split('.');
        let (Some(pid_str), Some(nanos_str), Some(counter_str), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            continue;
        };
        if pid_str.parse::<u32>().is_err() || counter_str.parse::<u64>().is_err() {
            continue;
        }
        let Ok(nanos) = nanos_str.parse::<u128>() else {
            continue;
        };
        if now_nanos.saturating_sub(nanos) < STALE_TMP_THRESHOLD_NANOS {
            // live load が進行中の可能性があるため温存。
            continue;
        }
        let _ = std::fs::remove_file(entry.path());
    }
}

/// `version` フィールドのみを抜き出す軽量スキーマ。
///
/// `serde_json::from_str` 経由で raw 文字列から直接デシリアライズすることで、
/// 欠落 / 型不一致 / `u32` 範囲外などの version 関連エラーが **元の line/column を
/// 保持した `serde_json::Error`** として返るようにする（`Value` 経由でカスタム
/// エラーを合成するアプローチでは line/col 情報が失われるため）。
///
/// `version` 以外のフィールドは無視する（`serde` のデフォルト挙動）ので、
/// 同一 raw 文字列に対する `Config` 用の本パースとは独立に version だけを
/// 取り出せる。
#[derive(Deserialize)]
struct VersionOnly {
    version: u32,
}

/// `<project_root>/.spec-board/config.json` を読み込み、不在の場合だけ `None` を返す。
///
/// 1. `.spec-board/` ディレクトリを冪等に作成する
/// 2. `config.json` の存在を確認し、不在なら `Ok(None)` を返す
/// 3. [`VersionOnly`] スキーマで `version` フィールドのみを `from_str` する
///    （JSON 構文 / 必須欠落 / 型不一致 / `u32` 範囲外を line/col 付きで検出）
/// 4. `version` が [`SchemaVersion::CURRENT`] を超える場合は [`LoadConfigError::UnknownFutureVersion`]
/// 5. `version` が古い場合は `<root>/.spec-board/config.json.bak` を作成し
///    [`crate::config::migration::migrate_config`] を適用する
/// 6. 現行 version は `from_str::<Config>`、古い version は `from_value::<Config>` で本パース
/// 7. `columns` が空でないこと / [`validate_unique_column_names`] でカラム名重複検証
///
/// # `None` を返す条件
///
/// `Ok(None)` は **「`config.json` が存在しないとき」だけ**を表す。「不在」と
/// 「読めた結果がたまたま既定値と同じ内容だった」を呼び出し側が区別できるようにする
/// ための入口であり、config 不在時にタスクの status からカラムを生成する
/// [`crate::project::open`] の bootstrap がこの区別に依存する。
///
/// 読み込み I/O の失敗 / JSON パースの失敗 / 未来 version / バックアップ失敗 /
/// カラム名重複は `Err` として返却され、呼び出し層（Tauri コマンド層など）が
/// 必要に応じて [`Config::default`] へのフォールバック判断 + 通知を行う想定
/// （仕様書「読み込み失敗 → デフォルト + トースト」は呼び出し層の責務として切り出す）。
///
/// # Errors
///
/// - `.spec-board/` の作成 / アクセスに失敗 → [`LoadConfigError::Io`]
/// - `config.json` の読み取りに失敗 → [`LoadConfigError::Io`]
/// - `config.json` のパースに失敗 → [`LoadConfigError::Parse`]
/// - `version` がサポート範囲を超える → [`LoadConfigError::UnknownFutureVersion`]
/// - `config.json.bak` の書き込みに失敗 → [`LoadConfigError::BackupFailed`]
/// - `columns` が空 → [`LoadConfigError::EmptyColumns`]
/// - カラム名重複 → [`LoadConfigError::DuplicateColumnName`]
///
/// [`LoadConfigError::MigrationFailed`] は **現状では本関数から返されない**
/// （`from_version > SchemaVersion::CURRENT` は事前に
/// [`LoadConfigError::UnknownFutureVersion`] で弾かれ、現行version以下の経路では
/// [`crate::config::migration::migrate_config`] は常に
/// `Ok` を返すため）。バリアントは `MigrationError` の variant 追加に向けた forward
/// compatibility のために存在し、将来 [`SchemaVersion::CURRENT`] を引き上げて実マイグレーション
/// を実装したタイミングで実際に発生し得るようになる。
pub fn load_persisted(project_root: &Path) -> Result<Option<Config>, LoadConfigError> {
    config_io::ensure_spec_board_dir(project_root)?;
    cleanup_stale_backup_tmps(project_root);
    let raw = config_io::read_config_json(project_root)?;
    let Some(content) = raw else {
        return Ok(None);
    };

    let path = config_io::config_path(project_root);

    // `VersionOnly` で raw 文字列から直接 version をデシリアライズする。
    // JSON 構文 / 必須欠落 / 型不一致 / `u32` 範囲外などのエラーは serde_json が
    // 元の line/col を持った `serde_json::Error` を返すため、hand-edited config.json
    // の version 由来エラーがそのまま位置情報付きで `LoadConfigError::Parse` に伝わる。
    let from_version = serde_json::from_str::<VersionOnly>(&content)
        .map(|v| v.version)
        .map_err(|source| LoadConfigError::Parse {
            path: path.clone(),
            source,
        })?;

    let current_version = SchemaVersion::CURRENT.as_u32();
    if from_version > current_version {
        return Err(LoadConfigError::UnknownFutureVersion {
            path: path.clone(),
            found: from_version,
            supported: current_version,
        });
    }

    // 現行 version の場合は `from_str::<Config>` で直接デシリアライズし、
    // schema mismatch 時に元の line/col 情報を保持する（`from_value` 経由だと位置情報が失われ、
    // hand-edited config.json の修正がしづらくなるため）。
    // 古い version の場合は `migrate_config` が `Value` を書き換える必要があるため
    // やむを得ず `from_value` を経由する（line/col 情報は失われるが、migrate 経路では
    // ユーザーが直接編集する想定が薄いため許容）。
    let config: Config = if from_version == current_version {
        serde_json::from_str(&content).map_err(|source| LoadConfigError::Parse {
            path: path.clone(),
            source,
        })?
    } else {
        let value: serde_json::Value =
            serde_json::from_str(&content).map_err(|source| LoadConfigError::Parse {
                path: path.clone(),
                source,
            })?;
        backup_config_json(project_root, &content)?;
        let migrated = migrate_config(value, from_version).map_err(|source| {
            LoadConfigError::MigrationFailed {
                path: path.clone(),
                source,
            }
        })?;
        serde_json::from_value(migrated).map_err(|source| LoadConfigError::Parse {
            path: path.clone(),
            source,
        })?
    };

    if config.columns.is_empty() {
        return Err(LoadConfigError::EmptyColumns { path: path.clone() });
    }
    validate_unique_column_names(&config.columns).map_err(|name| {
        LoadConfigError::DuplicateColumnName {
            path: path.clone(),
            name,
        }
    })?;

    let (config, changed) = config.normalize_card_order();
    if changed {
        log::warn!(
            "cardOrder normalized (duplicates removed): {}",
            path.display()
        );
    }

    Ok(Some(config.classify_column_names_after_validation()))
}

/// `<project_root>/.spec-board/config.json` を読み込み、不在なら [`Config::default`] を返す。
///
/// 「不在」と「既定値」を区別する必要がある呼び出し側は [`load_persisted`] を使う。
///
/// # Errors
///
/// [`load_persisted`] と同じ。不在以外の失敗はすべてそのまま伝播する。
pub fn load_or_default(project_root: &Path) -> Result<Config, LoadConfigError> {
    Ok(load_persisted(project_root)?.unwrap_or_default())
}
