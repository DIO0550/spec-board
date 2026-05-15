use super::OpenProjectIntent;
use crate::project::open::OpenProjectError;

#[test]
fn try_from_normal_path_succeeds() {
    let intent = OpenProjectIntent::try_from("/abs/proj".to_string())
        .expect("non-empty path should succeed");
    assert_eq!(intent.as_path_str(), "/abs/proj");
    assert_eq!(intent.as_path().to_string_lossy(), "/abs/proj");
}

#[test]
fn try_from_empty_string_maps_to_directory_not_found_with_empty_path() {
    // 旧 effect 層 (`validate_directory`) 経路で empty path が
    // `DirectoryNotFound { path: "" }` に倒れていた等価性を Intent 層が引き継ぐ
    // ことを担保する境界テスト。
    let err = OpenProjectIntent::try_from(String::new()).expect_err("empty path must fail");
    assert!(matches!(
        &err,
        OpenProjectError::DirectoryNotFound { path } if path.is_empty()
    ));
    assert_eq!(err.to_string(), "ディレクトリが見つかりません: ");
}

#[test]
fn try_from_preserves_raw_path_for_directory_not_found_display() {
    // 実在性チェックは effect 層の責務であり、TryFrom 自体は実在しないパスでも
    // 通る。`as_path_str()` が `to_str()` ではなく保持中の `raw: String` を
    // そのまま返す回帰テスト。
    let intent = OpenProjectIntent::try_from("/nonexistent/path/xyz".to_string())
        .expect("non-empty path should succeed");
    assert_eq!(intent.as_path_str(), "/nonexistent/path/xyz");
}
