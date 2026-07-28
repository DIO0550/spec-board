use super::*;

use std::path::PathBuf;

#[test]
fn from_root_yields_the_same_key_for_the_same_root() {
    let root = PathBuf::from("/home/user/specs");

    let left = ProjectKey::from_root(&root);
    let right = ProjectKey::from_root(&root);

    assert_eq!(left, right);
    assert_eq!("/home/user/specs", left.as_str());
}

#[test]
fn from_root_distinguishes_different_roots() {
    let left = ProjectKey::from_root(&PathBuf::from("/home/user/a"));
    let right = ProjectKey::from_root(&PathBuf::from("/home/user/b"));

    assert_ne!(left, right);
}

#[test]
fn serializes_transparently_as_a_bare_string() {
    let key = ProjectKey::from_root(&PathBuf::from("/home/user/specs"));

    let json = serde_json::to_string(&key).expect("serialize");

    assert_eq!("\"/home/user/specs\"", json);
}

#[test]
fn deserializes_transparently_from_a_bare_string() {
    let key: ProjectKey = serde_json::from_str("\"/home/user/specs\"").expect("deserialize");

    assert_eq!("/home/user/specs", key.as_str());
}

#[test]
fn empty_root_builds_an_empty_key_without_panicking() {
    let key = ProjectKey::from_root(&PathBuf::from(""));

    assert_eq!("", key.as_str());
}

#[test]
fn non_utf8_root_is_accepted_via_lossy_conversion() {
    let root = non_utf8_root();

    let key = ProjectKey::from_root(&root);

    assert!(
        !key.as_str().is_empty(),
        "非 UTF-8 の root でも key を生成できるべき"
    );
}

#[cfg(unix)]
fn non_utf8_root() -> PathBuf {
    use std::ffi::OsString;
    use std::os::unix::ffi::OsStringExt;

    PathBuf::from(OsString::from_vec(vec![b'/', 0xff, 0xfe]))
}

#[cfg(not(unix))]
fn non_utf8_root() -> PathBuf {
    PathBuf::from("/fallback")
}
