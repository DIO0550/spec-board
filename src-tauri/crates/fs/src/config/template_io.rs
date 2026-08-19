//! `.spec-board/templates/` 配下のタスクテンプレートファイル（`*.md`）の列挙と読み込み。
//!
//! 本モジュールはファイル I/O のみを担い、frontmatter のパースは本体クレート
//! （`spec-board`）側の責務とする（`config_io` と同じ境界規約）。

use std::path::{Path, PathBuf};

use super::config_io::{ConfigIoError, SPEC_BOARD_DIR};

/// `.spec-board/` 配下のテンプレート置き場ディレクトリ名。
pub const TEMPLATES_DIR_NAME: &str = "templates";

/// テンプレートファイル 1 件分の生データ。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TemplateFile {
    /// テンプレート名（拡張子を除いたファイル名）。
    pub name: String,
    /// ファイルの中身（frontmatter + 本文の raw Markdown）。
    pub content: String,
}

/// `.spec-board/templates/*.md` を読み込み、テンプレート名昇順で返す。
///
/// - `templates/` ディレクトリが存在しない場合は `Ok(vec![])`（テンプレート未使用の
///   プロジェクトを正常系として扱う）。
/// - `.md` 以外の拡張子・サブディレクトリ・symlink はテンプレートとして扱わず無視する
///   （`.spec-board/` 配下の他ファイル I/O が symlink を拒否するのと同じ安全側の方針）。
/// - `templates/` ディレクトリ自体が symlink の場合もテンプレートなしとして扱う
///   （symlink 先の外部ディレクトリを辿らない）。
///
/// # Errors
///
/// - `templates/` の列挙（`read_dir`）に失敗した場合
/// - 対象 `.md` ファイルの読み込み（`read_to_string`）に失敗した場合
pub fn read_template_files(project_root: &Path) -> Result<Vec<TemplateFile>, ConfigIoError> {
    let templates_dir = templates_dir_path(project_root);
    // `is_dir()` は symlink を辿るため、`templates/` 自体が symlink だと
    // `.spec-board/` 外の Markdown を読めてしまう。symlink_metadata で判定し、
    // symlink ディレクトリは「テンプレート置き場なし」として扱う
    // （配下の symlink ファイルを無視するのと同じ安全側の方針）。
    let metadata = match std::fs::symlink_metadata(&templates_dir) {
        Ok(metadata) => metadata,
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Vec::new());
        }
        Err(source) => return Err(io_error(templates_dir, source)),
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&templates_dir)
        .map_err(|source| io_error(templates_dir.clone(), source))?;

    let mut templates = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|source| io_error(templates_dir.clone(), source))?;
        let file_type = entry
            .file_type()
            .map_err(|source| io_error(entry.path(), source))?;
        if !file_type.is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        let content =
            std::fs::read_to_string(&path).map_err(|source| io_error(path.clone(), source))?;
        templates.push(TemplateFile {
            name: name.to_string(),
            content,
        });
    }

    templates.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(templates)
}

/// `<project_root>/.spec-board/templates/` のパスを返す（純粋計算、I/O なし）。
pub fn templates_dir_path(project_root: &Path) -> PathBuf {
    project_root.join(SPEC_BOARD_DIR).join(TEMPLATES_DIR_NAME)
}

/// `ConfigIoError::Io` を組み立てる内部ヘルパー。
fn io_error(path: PathBuf, source: std::io::Error) -> ConfigIoError {
    ConfigIoError::Io { path, source }
}

#[cfg(test)]
#[path = "template_io_tests.rs"]
mod template_io_tests;
