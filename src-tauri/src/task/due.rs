//! 期限 `due`（`YYYY-MM-DD`）を表す Value Object。
//!
//! frontmatter 由来の値を verbatim 保持する lenient コンストラクタ（`from_lenient`）を提供し、
//! 不正フォーマットでも原文を失わない（warning は呼び出し側で付与する）。
//! ISO 8601 日付としての妥当性判定（構文・月日範囲・うるう年）を VO のメソッドに集約する。

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct Due(String);

/// 生の due 文字列を分類した結果。frontmatter 由来の値が「期限なし / 妥当 / 不正」の
/// どれに当たるかという判断を Due ドメインに集約する。warning 発行や extras からの
/// 読み取りは呼び出し側（parse 層）の責務として残す。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DueFromRaw {
    /// 空文字（省略相当）。期限なし扱いで warning も無し。
    Unset,
    /// `YYYY-MM-DD` として妥当な値。
    Valid(Due),
    /// 解釈不能なフォーマット。原文は保持する（呼び出し側で warning を付与）。
    Invalid(Due),
}

impl Due {
    /// frontmatter 由来の値を verbatim 保持して構築する（不正値も保持）。
    pub fn from_lenient<S: Into<String>>(value: S) -> Self {
        Self(value.into())
    }

    /// 生の due 文字列を `DueFromRaw`（Unset / Valid / Invalid）へ分類する。
    ///
    /// 空文字は `Unset`、`YYYY-MM-DD` として妥当なら `Valid`、それ以外は原文を保持した
    /// `Invalid` を返す。frontmatter からの読み取りや warning 発行は呼び出し側に委ねる。
    pub fn from_raw(raw: &str) -> DueFromRaw {
        if raw.is_empty() {
            return DueFromRaw::Unset;
        }
        let due = Self::from_lenient(raw);
        if due.is_valid() {
            DueFromRaw::Valid(due)
        } else {
            DueFromRaw::Invalid(due)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// 保持している値が `YYYY-MM-DD`（構文 + 月日範囲 + うるう年）として妥当かを返す。
    pub fn is_valid(&self) -> bool {
        Self::is_valid_format(&self.0)
    }

    /// `YYYY-MM-DD` 妥当性判定（構築前の生文字列にも使える関連関数）。
    ///
    /// 構文（4桁-2桁-2桁）、月（1..=12）、日（その月・うるう年に応じた範囲）を判定する。
    /// 年は 4 桁固定（0000〜9999）を有効とし、FE 側（setUTCFullYear で 4 桁年を明示する実装）と
    /// 受理範囲を一致させる。
    pub fn is_valid_format(raw: &str) -> bool {
        let bytes = raw.as_bytes();
        // YYYY-MM-DD は固定 10 バイト
        if bytes.len() != 10 {
            return false;
        }
        if bytes[4] != b'-' || bytes[7] != b'-' {
            return false;
        }

        let year = match Self::parse_digits(&raw[0..4]) {
            Some(y) => y,
            None => {
                return false;
            }
        };
        let month = match Self::parse_digits(&raw[5..7]) {
            Some(m) => m,
            None => {
                return false;
            }
        };
        let day = match Self::parse_digits(&raw[8..10]) {
            Some(d) => d,
            None => {
                return false;
            }
        };

        if !(1..=12).contains(&month) {
            return false;
        }
        let max_day = Self::days_in_month(year, month);
        (1..=max_day).contains(&day)
    }

    /// ASCII 数字のみで構成される文字列を u32 に変換する（先頭ゼロ許容、符号・空白は不許可）。
    fn parse_digits(s: &str) -> Option<u32> {
        if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        s.parse::<u32>().ok()
    }

    /// 指定年月の日数を返す（グレゴリオ暦のうるう年判定込み）。
    fn days_in_month(year: u32, month: u32) -> u32 {
        match month {
            1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
            4 | 6 | 9 | 11 => 30,
            2 if Self::is_leap_year(year) => 29,
            2 => 28,
            _ => 0,
        }
    }

    fn is_leap_year(year: u32) -> bool {
        (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
    }
}

impl<'de> serde::Deserialize<'de> for Due {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(de)?;
        Ok(Self::from_lenient(raw))
    }
}

#[cfg(test)]
#[path = "due_tests.rs"]
mod due_tests;
