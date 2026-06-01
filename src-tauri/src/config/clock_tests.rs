//! `Clock` / `SystemClock` / `FixedClock` のユニットテスト。

use super::{Clock, FixedClock, SystemClock};

#[test]
fn system_clock_returns_iso8601_utc_with_z_suffix() {
    let now = SystemClock.now_iso8601();

    // ISO 8601 / RFC 3339（UTC, `Z` 終端）の形を文字列レベルで検証する
    // （`time` の parsing 機能に依存しないよう構造のみを確認）。
    let bytes = now.as_bytes();
    assert!(now.ends_with('Z'), "UTC の RFC 3339 は Z 終端: {now}");
    assert!(now.contains('T'), "日付と時刻は T 区切り: {now}");
    assert!(
        now.len() >= 20,
        "最低でも YYYY-MM-DDTHH:MM:SSZ の長さ: {now}"
    );
    assert_eq!(bytes[4], b'-', "年-月の区切り位置: {now}");
    assert_eq!(bytes[7], b'-', "月-日の区切り位置: {now}");
    assert_eq!(bytes[10], b'T', "日付と時刻の区切り位置: {now}");
    assert_eq!(bytes[13], b':', "時:分の区切り位置: {now}");
    assert_eq!(bytes[16], b':', "分:秒の区切り位置: {now}");
}

#[test]
fn fixed_clock_returns_the_configured_value() {
    let clock = FixedClock::new("2026-05-31T00:00:00Z");
    assert_eq!(clock.now_iso8601(), "2026-05-31T00:00:00Z");
    // 何度呼んでも同じ値（決定論的）。
    assert_eq!(clock.now_iso8601(), "2026-05-31T00:00:00Z");
}
