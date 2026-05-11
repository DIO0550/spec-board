use super::{Label, LabelError};

#[test]
fn try_from_str_rejects_empty() {
    assert_eq!(Label::try_from_str(""), Err(LabelError::Empty));
}

#[test]
fn try_from_str_accepts_non_empty() {
    let label = Label::try_from_str("bug").unwrap();
    assert_eq!(label.as_str(), "bug");
}

#[test]
fn from_lenient_accepts_empty() {
    let label = Label::from_lenient("");
    assert_eq!(label.as_str(), "");
}

#[test]
fn serde_round_trip() {
    let label = Label::try_from_str("bug").unwrap();
    let serialized = serde_json::to_string(&label).unwrap();
    assert_eq!(serialized, "\"bug\"");
    let restored: Label = serde_json::from_str(&serialized).unwrap();
    assert_eq!(restored, label);
}
