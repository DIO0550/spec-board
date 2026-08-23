//! `config.json` の `version` マイグレーションフック。
//!
//! 現状は骨格段階で、`version` フィールドの正規化のみを行う。実フィールド変換は
//! [`crate::config::SchemaVersion::CURRENT`] を将来引き上げるタイミングで追加する。

use crate::config::SchemaVersion;
use thiserror::Error;

/// [`migrate_config`] で発生し得るエラー。
///
/// 現状は `from_version` が [`SchemaVersion::CURRENT`] を超える場合のみ報告する。
/// 将来の現行versionを引き上げるタイミングで variant を追加する。
#[derive(Debug, PartialEq, Error)]
pub enum MigrationError {
    /// `from_version` が [`SchemaVersion::CURRENT`] より大きく、対応するマイグレーション経路が存在しない。
    #[error("unsupported migration from version {0}")]
    UnsupportedFromVersion(u32),
}

/// 古い `version` の `config.json` を新しい [`serde_json::Value`] に変換するフック。
///
/// # 入力前提
///
/// 入力 `value` は **`config.json` の最上位 JSON Object** を想定している。
/// [`crate::config::load::load_or_default`] からの呼び出しではこの前提が常に満たされる
/// （非 Object 入力は `VersionOnly` への `serde_json::from_str` が
/// 「invalid type: \<actual\>, expected struct VersionOnly」相当の Error を返し、
/// `LoadConfigError::Parse` に倒されるため本関数には到達しない）。
///
/// # 挙動
///
/// - `from_version == SchemaVersion::CURRENT` のときは入力 `value` をそのまま返す（素通し）。
/// - `from_version < SchemaVersion::CURRENT` かつ `value` が JSON Object のときは骨格実装として
///   **他フィールドを変更せず `value["version"]` のみ現行versionに書き換えて返す**。
///   これにより load 後の [`crate::config::Config::version`] が現行値に正規化される。
/// - `from_version < SchemaVersion::CURRENT` かつ `value` が JSON Object **以外**（純粋関数として
///   単独利用された場合のみ起こり得る）のときは正規化対象が無いため `value` をそのまま返す。
///   この経路は実マイグレーション実装時に [`MigrationError`] バリアント追加で厳格化する想定。
/// - `from_version > SchemaVersion::CURRENT` は通常 [`crate::config::load::load_or_default`] 側で
///   `LoadConfigError::UnknownFutureVersion` により早期に弾かれるが、純粋関数単独利用時の
///   防御として [`MigrationError::UnsupportedFromVersion`] を返す。
///
/// 将来の現行versionを引き上げる際に `match from_version` の各アームへ実フィールド
/// 変換ロジックを追加する。
///
/// # Errors
///
/// - `from_version` が現行versionより大きい場合 → [`MigrationError::UnsupportedFromVersion`]（純粋関数として単独呼び出しされたときの防御。通常は [`crate::config::load::load_or_default`] 側で `LoadConfigError::UnknownFutureVersion` により先に弾かれる）
pub fn migrate_config(
    value: serde_json::Value,
    from_version: u32,
) -> Result<serde_json::Value, MigrationError> {
    let current_version = SchemaVersion::CURRENT.as_u32();
    if from_version > current_version {
        return Err(MigrationError::UnsupportedFromVersion(from_version));
    }
    if from_version == current_version {
        return Ok(value);
    }

    let mut migrated = value;
    if let serde_json::Value::Object(ref mut map) = migrated {
        map.insert(
            "version".to_string(),
            serde_json::Value::Number(serde_json::Number::from(current_version)),
        );
    }
    Ok(migrated)
}
