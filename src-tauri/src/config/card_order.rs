//! `cardOrder` のドメイン型。
//!
//! キー = カラム名、値 = そのカラム内のタスクファイルパスの並び順。
//! 型が保証する不変条件は次の 2 つ:
//!
//! 1. 値はすべて canonical な相対パス（`/` 区切り・`.md` 必須・`..` を含まない）
//! 2. 同一カラム内で同じパスは 1 回だけ出現する（初出が勝つ）
//!
//! 「同一パスが全カラムを通して 1 回だけ」というカラム跨ぎの不変条件は、
//! カラムの表示順を知る必要があるため [`crate::config::core::Config::normalize_card_order`]
//! が担当する。カラム順は `Config` 側にしか無く、`Deserialize` の時点では
//! 手元に無いため、型のコンストラクタで閉じられるのはカラム内の不変条件までである。
//!
//! `.spec-board/config.json` は git にコミットされる前提のため、シリアライズ時に
//! キー順序が決定論的になる `BTreeMap`（キー昇順）を採用する。

use std::collections::{BTreeMap, HashSet};

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::config::column_name::ColumnName;
use crate::task::path_normalization::{contains_parent_dir, normalize_path_parts};
use crate::task::task_file_path::TaskFilePath;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct CardOrder(BTreeMap<ColumnName, Vec<TaskFilePath>>);

impl CardOrder {
    /// 空の cardOrder を返す。
    pub fn new() -> Self {
        Self(BTreeMap::new())
    }

    /// 生の `BTreeMap<String, Vec<String>>` から canonical 化して構築する。
    /// canonical にできない参照は棄却し、同一カラム内の重複は初出だけを残す。
    pub fn from_raw_map(raw: BTreeMap<String, Vec<String>>) -> Self {
        let inner = raw
            .into_iter()
            .map(|(column, paths)| (ColumnName::from_lenient(column), canonical_unique(&paths)))
            .collect();
        Self(inner)
    }

    /// 単一の raw パスを canonical 化する。canonical にできなければ `None`。
    ///
    /// 手順:
    /// 1. `\` を `/` に置換する
    /// 2. `normalize_path_parts` で空要素 / `.` / Windows ドライブ接頭辞を除去する
    /// 3. `..` セグメントを含むものは棄却する
    /// 4. `TaskFilePath::try_from_str` の strict 検証（空文字 / `.md` 必須など）に通す
    ///
    /// `TaskFilePath::from_relative_path(&Path)` を経由しないのは、入力が `&str` の
    /// ため `Path` へ包み直して文字列へ戻す往復が挟まるだけになるため。
    ///
    /// `..` の棄却をここに置くのは、`TaskFilePath::try_from_str` 自体は `..` を
    /// 通してしまうため。cardOrder はプロジェクトルート相対のタスク参照だけを持つ。
    pub fn canonical_path(raw: &str) -> Option<TaskFilePath> {
        let slashed = raw.replace('\\', "/");
        let normalized = normalize_path_parts(&slashed, true);
        if contains_parent_dir(&normalized) {
            return None;
        }
        TaskFilePath::try_from_str(&normalized).ok()
    }

    /// 指定カラムの並びを返す。キーが無ければ `None`。
    pub fn get(&self, column: &str) -> Option<&Vec<TaskFilePath>> {
        self.0.get(column)
    }

    /// 指定カラムに canonical 一致するパスが含まれるかを返す。
    pub fn contains_path(&self, column: &str, path: &str) -> bool {
        let Some(canonical) = Self::canonical_path(path) else {
            return false;
        };
        self.0
            .get(column)
            .is_some_and(|paths| paths.contains(&canonical))
    }

    /// キーと並びのペアをキー昇順で走査する。
    pub fn iter(&self) -> std::collections::btree_map::Iter<'_, ColumnName, Vec<TaskFilePath>> {
        self.0.iter()
    }

    /// キーだけをキー昇順で走査する。
    pub fn keys(&self) -> std::collections::btree_map::Keys<'_, ColumnName, Vec<TaskFilePath>> {
        self.0.keys()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// 指定カラムの並びを `paths` で置き換える。
    /// canonical 化と同一カラム内 dedupe は本メソッドが行うため、
    /// 呼び出し側は事前に重複除去をしなくてよい。
    pub fn set_column<S: AsRef<str>>(&mut self, column: &str, paths: &[S]) {
        self.0
            .insert(ColumnName::from_lenient(column), canonical_unique(paths));
    }

    /// 指定カラムの並びの末尾に `paths` を追加する。
    /// すでに含まれるパスは追加しない（初出が勝つ）。キーが無ければ新規作成する。
    pub fn append_to_column<S: AsRef<str>>(&mut self, column: &str, paths: &[S]) {
        let entry = self.0.entry(ColumnName::from_lenient(column)).or_default();
        for raw in paths {
            let Some(canonical) = Self::canonical_path(raw.as_ref()) else {
                continue;
            };
            if !entry.contains(&canonical) {
                entry.push(canonical);
            }
        }
    }
}

/// raw パス列を canonical 化し、初出だけを元の順序で残す。
fn canonical_unique<S: AsRef<str>>(paths: &[S]) -> Vec<TaskFilePath> {
    let mut seen: HashSet<TaskFilePath> = HashSet::new();
    let mut result: Vec<TaskFilePath> = Vec::new();
    for raw in paths {
        let Some(canonical) = CardOrder::canonical_path(raw.as_ref()) else {
            continue;
        };
        if seen.insert(canonical.clone()) {
            result.push(canonical);
        }
    }
    result
}

impl Serialize for CardOrder {
    /// 内部 `BTreeMap` へ委譲する。`ColumnName` / `TaskFilePath` はどちらも
    /// `#[serde(transparent)]` で String として出るため、JSON 表現は
    /// 旧 `BTreeMap<String, Vec<String>>` と完全に一致する。既存プロジェクトの
    /// `config.json` に無意味な差分を出さないための制約。
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for CardOrder {
    /// 生の map として受けてから canonical 化する。
    /// これにより「JSON から読んだ直後」も不変条件を満たす。
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = BTreeMap::<String, Vec<String>>::deserialize(deserializer)?;
        Ok(Self::from_raw_map(raw))
    }
}

#[cfg(test)]
#[path = "card_order_tests.rs"]
mod card_order_tests;
