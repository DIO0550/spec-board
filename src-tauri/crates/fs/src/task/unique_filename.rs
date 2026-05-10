//! kebab-case 化済みのベース名と拡張子から、既存ファイル名集合と衝突しない
//! ファイル名を生成する純粋関数を提供するモジュール。
//!
//! # 生成ルール
//!
//! - `existing` に `{base}.{ext}` が含まれない場合はそのまま返す。
//! - 含まれる場合は `{base}-1.{ext}`, `{base}-2.{ext}`, ... を順に試し、
//!   最初に `existing` に含まれない候補を返す。
//! - `ext` が空文字列の場合はドットを付けず、`{base}` / `{base}-1` /
//!   `{base}-2` / ... の形で組み立てる。
//! - `base` は不透明な文字列として扱い、内部のドットや末尾数字を解釈
//!   しない。例:
//!   - `base="task-1"`, `existing={"task-1.md"}` → `task-1-1.md`
//!   - `base="foo.bar"`, `ext="md"` → `foo.bar.md`（衝突時 `foo.bar-1.md`）
//! - 連番探索は `1u32..` の単純ループで行い、明示的な上限エラーは設けない
//!   （u32 範囲を使い切る前にメモリ・FS 側が破綻する想定）。
//!
//! # 不変条件
//!
//! - `base` は非空であること（呼び出し側責務。空文字列を渡した場合の
//!   動作は本関数の保証範囲外）。
//! - `ext` は先頭ドットを含まない拡張子文字列（例: `"md"`）であること。
//!   `".md"` のようにドット付きで渡した場合の動作は保証範囲外。
//! - `existing` の各要素は、本関数が比較する候補文字列と**同じ正規化**で
//!   構築されていること（例: kebab-case 化済み・小文字化済み）。本関数は
//!   大文字小文字を区別する単純な文字列比較を行う。
//!
//! kebab-case 化や実ファイル I/O は本関数の責務外であり、呼び出し側で
//! 行う。

use std::borrow::Borrow;
use std::collections::HashSet;
use std::hash::Hash;

/// `existing` と衝突しないファイル名を生成して返す。
///
/// - `base`: 拡張子を除いたファイル名（kebab-case 化済みを想定、非空）
/// - `ext`: 拡張子（例: `"md"`）。先頭ドットを含めない。空文字列の場合は
///   候補にドットを付けない
/// - `existing`: 既存ファイル名の集合（`{base}.{ext}` 形式で格納されている前提）。
///   `HashSet<String>` / `HashSet<&str>` のいずれもそのまま渡せる
///
/// 詳細な生成ルールと不変条件はモジュールレベルの doc コメントを参照。
pub fn build_unique_filename<S>(base: &str, ext: &str, existing: &HashSet<S>) -> String
where
    S: Borrow<str> + Eq + Hash,
{
    let compose = |stem: &str| -> String {
        if ext.is_empty() {
            stem.to_string()
        } else {
            format!("{stem}.{ext}")
        }
    };

    let candidate = compose(base);
    if !existing.contains(candidate.as_str()) {
        return candidate;
    }
    for n in 1u32.. {
        let stem = format!("{base}-{n}");
        let candidate = compose(&stem);
        if !existing.contains(candidate.as_str()) {
            return candidate;
        }
    }
    unreachable!("u32 範囲を使い切るほどの衝突は発生しない想定（base={base:?}, ext={ext:?}）")
}

#[cfg(test)]
#[path = "unique_filename_tests.rs"]
mod unique_filename_tests;
