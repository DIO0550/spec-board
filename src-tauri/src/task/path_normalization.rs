//! Task の file path 文字列を正規化するための共通 helper。
//!
//! `task::path_lookup` と各 VO（`task::task_file_path` 等）の双方から
//! 参照される pure helper を集める。VO が Aggregate (`task::task_index`) に依存する
//! 責務逆転を避けるため、独立モジュールとして切り出している。

/// slash 区切りの path 文字列から空要素、`.`、必要に応じて drive prefix を除去する。
///
/// @param path_text slash 区切りへ変換済みの path 文字列。
/// @param remove_drive_prefix `true` の場合は `C:` 形式（ASCII 1 文字 + `:`）の
///   先頭セグメントのみ除去する。Unix で正規ディレクトリ名となりうる `notes:`
///   のような任意末尾コロン文字列は誤って削除しない。
/// @returns 空要素、`.`、必要に応じた drive prefix を除いた path 文字列。
pub(crate) fn normalize_path_parts(path_text: &str, remove_drive_prefix: bool) -> String {
    let mut parts = Vec::new();
    let mut at_start = true;
    for part in path_text.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if remove_drive_prefix && at_start && is_drive_letter_segment(part) {
            at_start = false;
            continue;
        }
        at_start = false;
        parts.push(part);
    }
    parts.join("/")
}

/// セグメントが Windows の drive letter（`C:` のような ASCII 1 文字 + `:`）か判定する。
fn is_drive_letter_segment(segment: &str) -> bool {
    let bytes = segment.as_bytes();
    bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

/// path 文字列が `C:` 形式の Windows drive prefix で始まるかを判定する。
///
/// @param path 判定対象の path 文字列。
/// @returns 先頭 2 byte が ASCII alphabetic + `:` の場合は `true`。
pub(crate) fn has_windows_drive_prefix(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.len() < 2 {
        return false;
    }

    bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

#[cfg(test)]
#[path = "path_normalization_tests.rs"]
mod path_normalization_tests;
