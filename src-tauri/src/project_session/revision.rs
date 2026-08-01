//! ProjectSession内の成功commitを表すrevision。

use thiserror::Error;

/// session-local revisionをこれ以上進められないことを表す。
#[derive(Clone, Copy, Debug, Eq, Error, PartialEq)]
#[error("project session revision exhausted")]
pub struct RevisionExhausted;

/// session内でのみ単調増加するrevision。
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct SessionRevision(u64);

impl SessionRevision {
    /// 新しいsessionの初期revision。
    pub const INITIAL: Self = Self(0);

    /// 境界テストと互換adapter向けにraw値から構築する。
    #[cfg(test)]
    pub(crate) const fn from_raw(value: u64) -> Self {
        Self(value)
    }

    /// 次のrevisionをcheckedに作る。
    pub(crate) const fn checked_next(self) -> Result<Self, RevisionExhausted> {
        match self.0.checked_add(1) {
            Some(next) => Ok(Self(next)),
            None => Err(RevisionExhausted),
        }
    }

    /// wire互換adapterへ渡す数値を返す。
    pub const fn as_u64(self) -> u64 {
        self.0
    }
}
