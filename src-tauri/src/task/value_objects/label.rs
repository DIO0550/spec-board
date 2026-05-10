//! Task label を表す Value Object。
//!
//! `frontmatter::deserialize_string_vec_lenient` 経由でも空文字を含めて
//! 受け入れるため、custom Deserialize を `from_lenient` 経由にする。

use std::fmt;

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
#[serde(transparent)]
pub struct Label(String);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum LabelError {
    #[error("label must not be empty")]
    Empty,
}

impl Label {
    pub fn try_from_str(value: &str) -> Result<Self, LabelError> {
        if value.is_empty() {
            return Err(LabelError::Empty);
        }
        Ok(Self(value.to_string()))
    }

    pub fn from_lenient<S: Into<String>>(value: S) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

impl<'de> serde::Deserialize<'de> for Label {
    fn deserialize<D: serde::Deserializer<'de>>(de: D) -> Result<Self, D::Error> {
        Ok(Self::from_lenient(String::deserialize(de)?))
    }
}

impl From<&str> for Label {
    fn from(value: &str) -> Self {
        Self::from_lenient(value.to_string())
    }
}

impl From<String> for Label {
    fn from(value: String) -> Self {
        Self::from_lenient(value)
    }
}

impl fmt::Display for Label {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl PartialEq<&str> for Label {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

impl PartialEq<Label> for &str {
    fn eq(&self, other: &Label) -> bool {
        *self == other.0
    }
}

impl PartialEq<String> for Label {
    fn eq(&self, other: &String) -> bool {
        &self.0 == other
    }
}

impl PartialEq<Label> for String {
    fn eq(&self, other: &Label) -> bool {
        self == &other.0
    }
}

#[cfg(test)]
#[path = "label_tests.rs"]
mod label_tests;
