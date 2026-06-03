use super::{Due, DueFromRaw};

#[test]
fn is_valid_format_accepts_normal_dates() {
    assert!(Due::is_valid_format("2026-06-30"));
    assert!(Due::is_valid_format("2024-02-29"));
}

#[test]
fn is_valid_format_rejects_syntax_errors() {
    let cases = [
        "2026/6/30",
        "26-6-30",
        "2026-06-30T00",
        "tomorrow",
        "",
        "2026-6-3",
    ];
    for case in cases {
        assert!(!Due::is_valid_format(case), "{case} should be invalid");
    }
}

#[test]
fn is_valid_format_rejects_out_of_range_month_and_day() {
    let cases = ["2026-13-01", "2026-00-10", "2026-04-31", "2026-02-29"];
    for case in cases {
        assert!(!Due::is_valid_format(case), "{case} should be invalid");
    }
}

#[test]
fn is_valid_format_handles_leap_years() {
    assert!(Due::is_valid_format("2024-02-29"), "2024 is a leap year");
    assert!(
        !Due::is_valid_format("2100-02-29"),
        "2100 is not a leap year"
    );
    assert!(Due::is_valid_format("2000-02-29"), "2000 is a leap year");
}

#[test]
fn is_valid_format_accepts_four_digit_year_boundaries() {
    let cases = [
        "0001-01-01",
        "0099-12-31",
        "0100-01-01",
        "1000-01-01",
        "9999-12-31",
    ];
    for case in cases {
        assert!(Due::is_valid_format(case), "{case} should be valid");
    }
}

#[test]
fn from_lenient_keeps_original_value_even_when_invalid() {
    let due = Due::from_lenient("2026/6/30");
    assert_eq!(due.as_str(), "2026/6/30");
    assert!(!due.is_valid());
}

#[test]
fn from_lenient_reports_valid_for_well_formed_date() {
    let due = Due::from_lenient("2026-06-30");
    assert_eq!(due.as_str(), "2026-06-30");
    assert!(due.is_valid());
}

#[test]
fn serializes_transparently_as_string() {
    let due = Due::from_lenient("2026-06-30");
    let json = serde_json::to_string(&due).expect("serialize");
    assert_eq!(json, "\"2026-06-30\"");
}

#[test]
fn deserializes_leniently_from_string() {
    let due: Due = serde_json::from_str("\"2026/6/30\"").expect("deserialize");
    assert_eq!(due.as_str(), "2026/6/30");
    assert!(!due.is_valid());
}

#[test]
fn from_raw_classifies_empty_as_unset() {
    assert_eq!(Due::from_raw(""), DueFromRaw::Unset);
}

#[test]
fn from_raw_classifies_well_formed_date_as_valid() {
    assert_eq!(
        Due::from_raw("2026-06-30"),
        DueFromRaw::Valid(Due::from_lenient("2026-06-30"))
    );
}

#[test]
fn from_raw_classifies_invalid_format_as_invalid_keeping_original() {
    let cases = ["2026/6/30", "tomorrow", "2026-02-29"];
    for raw in cases {
        assert_eq!(
            Due::from_raw(raw),
            DueFromRaw::Invalid(Due::from_lenient(raw)),
            "{raw} should be classified as Invalid with original kept"
        );
    }
}
