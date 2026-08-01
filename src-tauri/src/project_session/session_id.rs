//! 成功したproject openを識別するsession ID。

use thiserror::Error;

/// 同じpathの再openも区別する、process内で一意なsession ID。
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SessionId(u64);

/// process内で新しいsession IDを採番できない。
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("project session id exhausted")]
pub struct SessionIdExhausted;

impl SessionId {
    /// AppStateが採番したraw値から構築する。
    pub(crate) const fn from_raw(value: u64) -> Self {
        Self(value)
    }

    /// wire互換adapterへ渡す数値を返す。
    pub const fn as_u64(self) -> u64 {
        self.0
    }
}
