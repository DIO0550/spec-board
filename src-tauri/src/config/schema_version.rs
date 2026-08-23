//! 正規化済み [`crate::config::Config`] が保持するスキーマバージョン Value Object。

use serde::{Deserialize, Serialize};

/// 現行スキーマバージョンだけを表す Value Object。
///
/// raw数値からの直接構築を許さず、現行値は [`SchemaVersion::CURRENT`] から得る。
///
/// ```compile_fail,E0423
/// use spec_board_lib::config::SchemaVersion;
///
/// let _ = SchemaVersion(1);
/// ```
///
/// 内部数値も公開せず、wire値の参照には [`SchemaVersion::as_u32`] を使う。
///
/// ```compile_fail,E0616
/// use spec_board_lib::config::SchemaVersion;
///
/// let _ = SchemaVersion::CURRENT.0;
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct SchemaVersion(u32);

impl SchemaVersion {
    /// アプリケーションが扱う現行スキーマバージョン。
    pub const CURRENT: Self = Self(1);

    /// JSON wireで使う数値を返す。
    pub const fn as_u32(self) -> u32 {
        self.0
    }
}

impl<'de> Deserialize<'de> for SchemaVersion {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let raw = u32::deserialize(deserializer)?;
        if raw != Self::CURRENT.as_u32() {
            return Err(serde::de::Error::custom(format!(
                "unsupported schema version {raw}; expected {}",
                Self::CURRENT.as_u32()
            )));
        }
        Ok(Self::CURRENT)
    }
}
