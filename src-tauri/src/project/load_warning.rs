use serde::Serialize;

/// Project load で発生した recoverable warning の分類。
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectLoadWarningCode {
    ScanEntryError,
    MetadataError,
    UnreadableFile,
    FileTooLarge,
    BinaryFile,
    InvalidPath,
    TaskReadFailed,
    FrontmatterParseFailed,
    ConfigFallback,
    Unknown,
}

/// Project load warning が発生した処理段階。
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectLoadWarningStage {
    Scan,
    Read,
    Parse,
    Config,
    Unknown,
}

/// Task として採用されなかった file/config の理由。
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLoadWarning {
    pub code: ProjectLoadWarningCode,
    pub stage: ProjectLoadWarningStage,
    pub path: Option<String>,
    pub message: String,
    pub recoverable: bool,
}

impl ProjectLoadWarning {
    /// recoverable な warning を作る。
    pub fn new(
        code: ProjectLoadWarningCode,
        stage: ProjectLoadWarningStage,
        path: Option<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            stage,
            path,
            message: message.into(),
            recoverable: true,
        }
    }

    /// config fallback を表す warning を作る。
    pub fn config_fallback(message: impl Into<String>) -> Self {
        Self::new(
            ProjectLoadWarningCode::ConfigFallback,
            ProjectLoadWarningStage::Config,
            Some(".spec-board/config.json".to_owned()),
            message,
        )
    }
}

/// warning の重複を除去し、payload に安定した順序で返す。
pub fn deduplicate_and_sort(mut warnings: Vec<ProjectLoadWarning>) -> Vec<ProjectLoadWarning> {
    warnings.sort_by_cached_key(warning_sort_key);
    warnings.dedup();
    warnings
}

fn warning_sort_key(warning: &ProjectLoadWarning) -> (String, String, String, String, bool) {
    (
        format!("{:?}", warning.stage),
        warning.path.clone().unwrap_or_default(),
        format!("{:?}", warning.code),
        warning.message.clone(),
        warning.recoverable,
    )
}

#[cfg(test)]
mod tests {
    use super::{
        deduplicate_and_sort, ProjectLoadWarning, ProjectLoadWarningCode, ProjectLoadWarningStage,
    };

    #[test]
    fn warning_serializes_with_camel_case_fields_and_code() {
        let warning = ProjectLoadWarning::new(
            ProjectLoadWarningCode::FrontmatterParseFailed,
            ProjectLoadWarningStage::Parse,
            Some("tasks/broken.md".to_owned()),
            "frontmatter is invalid",
        );

        let value = serde_json::to_value(warning).expect("warning should serialize");

        assert_eq!(value["code"], "frontmatterParseFailed");
        assert_eq!(value["stage"], "parse");
        assert_eq!(value["path"], "tasks/broken.md");
        assert_eq!(value["message"], "frontmatter is invalid");
        assert_eq!(value["recoverable"], true);
    }

    #[test]
    fn config_fallback_uses_stable_config_path_and_stage() {
        let warning = ProjectLoadWarning::config_fallback("invalid config");

        assert_eq!(warning.code, ProjectLoadWarningCode::ConfigFallback);
        assert_eq!(warning.stage, ProjectLoadWarningStage::Config);
        assert_eq!(warning.path.as_deref(), Some(".spec-board/config.json"));
        assert!(warning.recoverable);
    }

    #[test]
    fn duplicate_warnings_are_removed_in_stable_order() {
        let duplicate = ProjectLoadWarning::new(
            ProjectLoadWarningCode::TaskReadFailed,
            ProjectLoadWarningStage::Read,
            Some("tasks/b.md".to_owned()),
            "read failed",
        );
        let earlier = ProjectLoadWarning::new(
            ProjectLoadWarningCode::TaskReadFailed,
            ProjectLoadWarningStage::Read,
            Some("tasks/a.md".to_owned()),
            "read failed",
        );

        let warnings = deduplicate_and_sort(vec![duplicate.clone(), earlier, duplicate]);

        assert_eq!(warnings.len(), 2);
        assert_eq!(warnings[0].path.as_deref(), Some("tasks/a.md"));
        assert_eq!(warnings[1].path.as_deref(), Some("tasks/b.md"));
    }

    #[test]
    fn warnings_that_differ_by_recoverable_are_not_deduplicated() {
        let recoverable = ProjectLoadWarning::new(
            ProjectLoadWarningCode::TaskReadFailed,
            ProjectLoadWarningStage::Read,
            Some("tasks/a.md".to_owned()),
            "read failed",
        );
        let non_recoverable = ProjectLoadWarning {
            recoverable: false,
            ..recoverable.clone()
        };

        let warnings =
            deduplicate_and_sort(vec![recoverable.clone(), non_recoverable, recoverable]);

        assert_eq!(warnings.len(), 2);
        assert!(warnings.iter().any(|warning| !warning.recoverable));
    }
}
