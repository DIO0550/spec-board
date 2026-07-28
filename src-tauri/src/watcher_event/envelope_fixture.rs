//! `fixtures/watcher-event/envelope.json` の Rust 側ローダ。
//!
//! TS 側は `@fixtures/watcher-event/envelope.json` を import して同じファイルを
//! 検証する。IPC の envelope は型システムを跨がない外部契約なので、片側だけ
//! 変えてもコンパイルは通ってしまう。両 CI job が同一ファイルを読むことで、
//! 形の食い違いをビルド時に落とす。
//!
//! CI は `working-directory: src-tauri` で走るためランタイム `read_to_string`
//! では相対パスが解決できない。`include_str!` でバイナリに焼き込む。

use serde::Deserialize;

/// fixture JSON の全体構造。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EnvelopeFixture {
    pub(crate) description: String,
    pub(crate) cases: Vec<EnvelopeCase>,
}

/// 1 event 分の代表 envelope。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EnvelopeCase {
    /// Tauri event 名（`task-created` 等）。
    pub(crate) event_name: String,
    /// envelope 全体。payload の型は event 名で決まる。
    pub(crate) envelope: serde_json::Value,
}

pub(crate) const WATCHER_ENVELOPE_FIXTURE_JSON: &str =
    include_str!("../../../fixtures/watcher-event/envelope.json");

/// fixture をパースして返す。
///
/// # Panics
///
/// JSON パースに失敗した場合（fixture の破損）。
pub(crate) fn load_fixture() -> EnvelopeFixture {
    serde_json::from_str(WATCHER_ENVELOPE_FIXTURE_JSON).expect("fixture JSON must parse")
}

#[cfg(test)]
#[path = "envelope_fixture_tests.rs"]
mod envelope_fixture_tests;
