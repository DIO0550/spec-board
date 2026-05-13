use super::{TaskContent, TaskContentError};

#[test]
fn try_new_accepts_content_at_max_file_size_boundary() {
    let max = 1024 * 1024;
    let content = "a".repeat(max);
    let vo = TaskContent::try_new(content).expect("max boundary should succeed");
    assert_eq!(vo.as_bytes().len(), max);
}

#[test]
fn try_new_rejects_content_one_byte_over_max() {
    let too_large = "a".repeat(1024 * 1024 + 1);
    let err = TaskContent::try_new(too_large).expect_err("should fail");
    assert!(matches!(
        err,
        TaskContentError::TooLarge {
            size: 1048577,
            limit: 1048576,
        }
    ));
}

#[test]
fn try_new_rejects_content_with_nul_byte_in_first_8kib() {
    let mut content = String::from("hello");
    content.push('\u{0000}');
    content.push_str("world");
    let err = TaskContent::try_new(content).expect_err("should fail");
    assert!(matches!(
        err,
        TaskContentError::BinaryDetected { probe: 8192 }
    ));
}

#[test]
fn try_new_accepts_nul_byte_beyond_first_8kib() {
    let mut content = "a".repeat(8 * 1024);
    content.push('\u{0000}');
    let vo = TaskContent::try_new(content).expect("nul beyond probe should succeed");
    assert_eq!(vo.as_bytes().len(), 8 * 1024 + 1);
}

#[test]
fn as_str_and_into_string_return_original_content() {
    let raw = String::from("---\ntitle: Foo\nstatus: Todo\n---\n");
    let vo = TaskContent::try_new(raw.clone()).expect("valid");
    assert_eq!(vo.as_str(), &raw);
    assert_eq!(vo.into_string(), raw);
}
