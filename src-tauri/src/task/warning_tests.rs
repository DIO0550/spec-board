use super::{TaskWarning, TaskWarningCode};

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
