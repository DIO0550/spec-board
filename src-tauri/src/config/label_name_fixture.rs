//! TS adapter テストと共有する label 名 identity fixture のパース helper。
//!
//! `fixtures/label-name/round-trip.json` を `include_str!` で読み込み、
//! 各テストファイル（`create_label_tests` / `update_label_tests` / `label_registry_tests`）
//! から `pub(crate)` で参照する。BE 実装の変更はなし。

use serde::Deserialize;

/// fixture JSON の全体構造。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LabelNameFixture {
    pub(crate) identity_cases: Vec<IdentityCase>,
    pub(crate) duplicate_pairs: Vec<DuplicatePair>,
}

/// name の raw identity round-trip を検証する 1 ケース。
#[derive(Debug, Deserialize)]
pub(crate) struct IdentityCase {
    pub(crate) id: String,
    pub(crate) name: String,
}

/// 完全一致 / 類似 / 無関係の duplicate 判定ペア。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DuplicatePair {
    pub(crate) id: String,
    pub(crate) existing: String,
    pub(crate) candidate: String,
    pub(crate) exact_duplicate: bool,
    pub(crate) similar: bool,
}

/// fixture JSON の文字列定数。
pub(crate) const LABEL_NAME_FIXTURE_JSON: &str =
    include_str!("../../../fixtures/label-name/round-trip.json");

/// fixture をパースして返す。
///
/// # Panics
/// JSON パースに失敗した場合（fixture の破損）。
pub(crate) fn load_fixture() -> LabelNameFixture {
    serde_json::from_str(LABEL_NAME_FIXTURE_JSON).expect("fixture JSON must parse")
}
