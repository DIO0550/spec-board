//! カラム名を表す Value Object。
//!
//! `validate_unique_column_names` は前後空白付きや空文字も完全一致比較で
//! 受け入れる仕様のため、`from_lenient` を別途用意して既存挙動を保つ。
//! `Task.status` も `default_status_for` が空 columns 時に `""` を返す
//! 既存挙動を保護するため、本 VO の lenient 構築で表現する。

use std::fmt;
use std::ops::Deref;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct ColumnName(String);

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
        Ok(Self(value.to_string()))
    }

    /// lenient: 既存 `Column.name: String` の挙動互換用。
    pub fn from_lenient<S: Into<String>>(value: S) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl<'de> serde::Deserialize<'de> for ColumnName {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        Ok(Self::from_lenient(String::deserialize(de)?))
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
        f.write_str(&self.0)
    }
}

impl AsRef<str> for ColumnName {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl Deref for ColumnName {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl PartialEq<&str> for ColumnName {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

impl PartialEq<ColumnName> for &str {
    fn eq(&self, other: &ColumnName) -> bool {
        *self == other.0
    }
}

impl PartialEq<ColumnName> for str {
    fn eq(&self, other: &ColumnName) -> bool {
        self == other.0
    }
}

impl PartialEq<String> for ColumnName {
    fn eq(&self, other: &String) -> bool {
        &self.0 == other
    }
}

impl PartialEq<ColumnName> for String {
    fn eq(&self, other: &ColumnName) -> bool {
        self == &other.0
    }
}

#[cfg(test)]
#[path = "column_name_tests.rs"]
mod column_name_tests;
