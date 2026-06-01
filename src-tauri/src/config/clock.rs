//! ラベル `create` / `update` 時の `updated` 自動セットに使う時刻供給源。
//!
//! 実時刻に依存すると `updated` の値がテストごとに変わり assertion できないため、
//! [`Clock`] trait で時刻取得を抽象化し、本番は [`SystemClock`]、テストは固定値を
//! 返すスタブ（`FixedClock`）を `_impl` / `plan_*` に注入する。

use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

/// 現在時刻（UTC, ISO 8601 / RFC 3339, `Z` サフィックス）の供給源。
///
/// テスト時は固定値を返すスタブへ差し替えることで `updated` の自動セットを
/// 決定論的に検証できる。
pub trait Clock {
    /// 現在時刻を ISO 8601 / RFC 3339（UTC・`Z` 終端）文字列で返す。
    fn now_iso8601(&self) -> String;
}

/// 本番用 [`Clock`]。`OffsetDateTime::now_utc()` を RFC 3339(`Z`) で整形する。
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_iso8601(&self) -> String {
        // RFC 3339 は ISO 8601 のサブセット。UTC のため `Z` サフィックスになる。
        // now_utc() の RFC 3339 整形は西暦 9999 年までは失敗しないため、失敗時は
        // 不変条件違反として panic させる（空文字を保存して updated 契約を破らない）。
        OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .expect("RFC 3339 formatting of OffsetDateTime::now_utc should not fail")
    }
}

/// 固定の ISO 8601 文字列を返すテスト用 [`Clock`]。
///
/// `plan_create_label` / `plan_update_label` の `updated` 自動セットや、
/// `create_label_impl` / `update_label_impl` の effect テストで時刻を固定する。
#[cfg(test)]
pub(crate) struct FixedClock {
    iso: String,
}

#[cfg(test)]
impl FixedClock {
    pub(crate) fn new(iso: impl Into<String>) -> Self {
        Self { iso: iso.into() }
    }
}

#[cfg(test)]
impl Clock for FixedClock {
    fn now_iso8601(&self) -> String {
        self.iso.clone()
    }
}

#[cfg(test)]
#[path = "clock_tests.rs"]
mod clock_tests;
