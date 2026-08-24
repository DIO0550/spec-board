use super::{has_parent_cycle_warning, TaskWarning, TaskWarningCode};

#[test]
fn has_parent_cycle_warning_returns_true_when_code_and_field_match() {
    let warnings = vec![TaskWarning {
        code: TaskWarningCode::ParentCycle,
        field: Some("parent".to_string()),
        message: "parent chain forms a cycle".to_string(),
    }];
    assert!(has_parent_cycle_warning(&warnings));
}

#[test]
fn has_parent_cycle_warning_returns_false_when_field_mismatches() {
    let warnings = vec![TaskWarning {
        code: TaskWarningCode::ParentCycle,
        field: Some("links".to_string()),
        message: "x".to_string(),
    }];
    assert!(!has_parent_cycle_warning(&warnings));
}

#[test]
fn has_parent_cycle_warning_returns_false_for_other_codes() {
    let warnings = vec![TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".to_string()),
        message: "x".to_string(),
    }];
    assert!(!has_parent_cycle_warning(&warnings));
}

#[test]
fn has_parent_cycle_warning_returns_false_for_empty_slice() {
    assert!(!has_parent_cycle_warning(&[]));
}

#[test]
fn parent_cycle_code_serializes_to_camel_case_string() {
    let serialized = serde_json::to_string(&TaskWarningCode::ParentCycle).expect("serialize code");
    assert_eq!(serialized, "\"parentCycle\"");
}

#[test]
fn parent_cycle_code_round_trips_through_serde() {
    let json = "\"parentCycle\"";
    let deserialized: TaskWarningCode = serde_json::from_str(json).expect("deserialize code");
    assert_eq!(deserialized, TaskWarningCode::ParentCycle);
}

#[test]
fn parent_cycle_warning_serializes_with_camel_case_field_names() {
    let warning = TaskWarning {
        code: TaskWarningCode::ParentCycle,
        field: Some("parent".to_string()),
        message: "parent chain forms a cycle".to_string(),
    };
    let serialized = serde_json::to_value(&warning).expect("serialize warning");
    assert_eq!(serialized["code"], "parentCycle");
    assert_eq!(serialized["field"], "parent");
    assert_eq!(serialized["message"], "parent chain forms a cycle");
}

#[test]
fn warning_without_field_omits_the_field_key() {
    let warning = TaskWarning {
        code: TaskWarningCode::NonStringExtraKeyIgnored,
        field: None,
        message: "non-string extra key was ignored".to_string(),
    };

    let serialized = serde_json::to_value(&warning).expect("serialize warning");

    assert_eq!(
        serialized,
        serde_json::json!({
            "code": "nonStringExtraKeyIgnored",
            "message": "non-string extra key was ignored"
        })
    );
}

#[test]
fn warning_with_field_keeps_the_field_key() {
    let warning = TaskWarning {
        code: TaskWarningCode::ParentNotFound,
        field: Some("parent".to_string()),
        message: "parent task was not found".to_string(),
    };

    let serialized = serde_json::to_value(&warning).expect("serialize warning");

    assert_eq!(
        serialized,
        serde_json::json!({
            "code": "parentNotFound",
            "field": "parent",
            "message": "parent task was not found"
        })
    );
}

#[test]
fn warning_deserializes_missing_field_as_none() {
    let warning: TaskWarning = serde_json::from_value(serde_json::json!({
        "code": "nonStringExtraKeyIgnored",
        "message": "non-string extra key was ignored"
    }))
    .expect("deserialize warning without field");

    assert_eq!(warning.field, None);
}

#[test]
fn warning_deserializes_null_field_as_none() {
    let warning: TaskWarning = serde_json::from_value(serde_json::json!({
        "code": "nonStringExtraKeyIgnored",
        "field": null,
        "message": "non-string extra key was ignored"
    }))
    .expect("deserialize legacy warning with null field");

    assert_eq!(warning.field, None);
}

#[test]
fn invalid_due_code_serializes_to_camel_case_string() {
    let serialized = serde_json::to_string(&TaskWarningCode::InvalidDue).expect("serialize code");
    assert_eq!(serialized, "\"invalidDue\"");
}

#[test]
fn invalid_due_code_round_trips_through_serde() {
    let json = "\"invalidDue\"";
    let deserialized: TaskWarningCode = serde_json::from_str(json).expect("deserialize code");
    assert_eq!(deserialized, TaskWarningCode::InvalidDue);
}
