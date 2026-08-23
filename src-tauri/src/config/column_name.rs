//! カラム名を表す Value Object。
//!
//! `validate_unique_column_names` は前後空白付きや空文字も完全一致比較で
//! 受け入れる仕様のため、`from_lenient` を別途用意して既存挙動を保つ。
//! `Task.status` も `default_status_for` が空 columns 時に `""` を返す
//! 既存挙動を保護するため、本 VO の lenient 構築で表現する。

use std::fmt;
use std::ops::Deref;

use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Clone, Copy, PartialEq, Eq)]
enum ValidationState {
    Lenient,
    Validated,
}

#[derive(Clone)]
pub struct ColumnName {
    value: String,
    state: ValidationState,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ColumnNameError {
    #[error("column name must not be empty")]
    Empty,
}

impl ColumnName {
    /// strict コンストラクタ。空文字を拒否する。
    pub fn try_from_str(value: &str) -> Result<Self, ColumnNameError> {
        if value.is_empty() {
            return Err(ColumnNameError::Empty);
        }
        Ok(Self {
            value: value.to_string(),
            state: ValidationState::Validated,
        })
    }

    /// lenient: 既存 `Column.name: String` の挙動互換用。
    pub fn from_lenient<S: Into<String>>(value: S) -> Self {
        Self {
            value: value.into(),
            state: ValidationState::Lenient,
        }
    }

    /// 検証済みの config 名を strict constructor に通して分類する。
    /// exact empty は既存互換の lenient 値として保持する。
    pub(crate) fn classify_after_validation<S: Into<String>>(value: S) -> Self {
        let value = value.into();
        let classified = Self::try_from_str(&value)
            .unwrap_or_else(|ColumnNameError::Empty| Self::from_lenient(value));
        debug_assert!(classified.is_validated() || classified.is_empty());
        classified
    }

    #[must_use]
    pub(crate) fn is_validated(&self) -> bool {
        self.state == ValidationState::Validated
    }

    pub fn as_str(&self) -> &str {
        &self.value
    }

    pub fn into_string(self) -> String {
        self.value
    }

    pub fn is_empty(&self) -> bool {
        self.value.is_empty()
    }
}

impl fmt::Debug for ColumnName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_tuple("ColumnName").field(&self.value).finish()
    }
}

impl PartialEq for ColumnName {
    fn eq(&self, other: &Self) -> bool {
        self.value == other.value
    }
}

impl Eq for ColumnName {}

impl PartialOrd for ColumnName {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ColumnName {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.value.cmp(&other.value)
    }
}

impl std::hash::Hash for ColumnName {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        std::hash::Hash::hash(&self.value, state);
    }
}

impl Serialize for ColumnName {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.value.serialize(serializer)
    }
}

impl<'de> serde::Deserialize<'de> for ColumnName {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        Ok(Self::from_lenient(String::deserialize(de)?))
    }
}

/// `BTreeMap<ColumnName, _>` / `HashMap<ColumnName, _>` を `&str` のまま引けるようにする。
/// `PartialEq` / `Ord` / `Hash` の manual 実装はいずれも raw `String` だけへ委譲し、
/// 借用元と借用先で比較・順序・ハッシュが一致するという `Borrow` の要求を満たす。
impl std::borrow::Borrow<str> for ColumnName {
    fn borrow(&self) -> &str {
        &self.value
    }
}

impl From<&str> for ColumnName {
    fn from(value: &str) -> Self {
        Self::from_lenient(value.to_string())
    }
}

impl From<String> for ColumnName {
    fn from(value: String) -> Self {
        Self::from_lenient(value)
    }
}

impl fmt::Display for ColumnName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.value)
    }
}

impl AsRef<str> for ColumnName {
    fn as_ref(&self) -> &str {
        &self.value
    }
}

impl Deref for ColumnName {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

impl PartialEq<&str> for ColumnName {
    fn eq(&self, other: &&str) -> bool {
        self.value == *other
    }
}

impl PartialEq<ColumnName> for &str {
    fn eq(&self, other: &ColumnName) -> bool {
        *self == other.value
    }
}

impl PartialEq<ColumnName> for str {
    fn eq(&self, other: &ColumnName) -> bool {
        self == other.value
    }
}

impl PartialEq<String> for ColumnName {
    fn eq(&self, other: &String) -> bool {
        &self.value == other
    }
}

impl PartialEq<ColumnName> for String {
    fn eq(&self, other: &ColumnName) -> bool {
        self == &other.value
    }
}

#[cfg(test)]
#[path = "column_name_tests.rs"]
mod column_name_tests;
