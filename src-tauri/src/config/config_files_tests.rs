use std::path::Path;

use tempfile::TempDir;

use super::{
    get_config_files_impl, regenerate_guide_impl, resolve_config_file_path,
    resolve_config_folder_path, ConfigFileCommandError, ConfigFileTarget, OpenConfigFileTarget,
};
use crate::config::Config;
use crate::state::AppState;

fn opened_state(root: &Path) -> AppState {
    let state = AppState::new();
    state
        .test_set_project_root(Some(root.to_path_buf()))
        .expect("project root writable");
    state
        .test_replace_config(Some(Config::default()))
        .expect("config writable");
    state
}

fn write_fixture(root: &Path) {
    let spec_board = root.join(".spec-board");
    std::fs::create_dir_all(&spec_board).unwrap();
    std::fs::write(spec_board.join("config.json"), "{\"version\":1}\n").unwrap();
    std::fs::write(spec_board.join("GUIDE.md"), "# old guide\n").unwrap();
}

#[cfg(unix)]
fn assert_symlink_boundary(error: ConfigFileCommandError, expected_path: &Path) {
    assert!(matches!(
        error,
        ConfigFileCommandError::SymlinkBoundary { ref path } if path == expected_path
    ));
}

#[test]
fn reads_only_config_and_guide_from_active_project() {
    let tmp = TempDir::new().unwrap();
    write_fixture(tmp.path());
    let payload = get_config_files_impl(&opened_state(tmp.path())).expect("readable");

    assert_eq!(payload.files.len(), 2);
    assert_eq!(payload.files[0].id, ConfigFileTarget::Config);
    assert_eq!(payload.files[0].content, "{\"version\":1}\n");
    assert_eq!(payload.files[1].id, ConfigFileTarget::Guide);
    assert_eq!(payload.files[1].content, "# old guide\n");
}

#[test]
fn rejects_unknown_and_traversal_targets_before_path_resolution() {
    for value in ["unknown", "../config", "/etc/passwd", "guide/../../secret"] {
        let error = OpenConfigFileTarget::try_from(value).expect_err("restricted target");
        assert!(matches!(
            error,
            ConfigFileCommandError::InvalidTarget(ref target) if target == value
        ));
    }
}

#[test]
fn accepts_labels_as_a_fixed_open_only_target() {
    assert_eq!(
        OpenConfigFileTarget::try_from("labels").unwrap(),
        OpenConfigFileTarget::Labels
    );
}

#[test]
fn resolves_only_fixed_paths_inside_spec_board_directory() {
    let tmp = TempDir::new().unwrap();
    write_fixture(tmp.path());

    assert_eq!(
        resolve_config_file_path(tmp.path(), OpenConfigFileTarget::Config).unwrap(),
        tmp.path().join(".spec-board/config.json")
    );
    assert_eq!(
        resolve_config_file_path(tmp.path(), OpenConfigFileTarget::Guide).unwrap(),
        tmp.path().join(".spec-board/GUIDE.md")
    );
    assert_eq!(
        resolve_config_folder_path(tmp.path()).unwrap(),
        tmp.path().join(".spec-board")
    );
}

#[test]
fn resolves_labels_to_the_fixed_registry_path() {
    let tmp = TempDir::new().unwrap();
    assert_eq!(
        resolve_config_file_path(tmp.path(), OpenConfigFileTarget::Labels).unwrap(),
        tmp.path().join(".spec-board/labels.yml")
    );
}

#[test]
fn missing_file_has_a_typed_error() {
    let tmp = TempDir::new().unwrap();
    std::fs::create_dir(tmp.path().join(".spec-board")).unwrap();
    let error = get_config_files_impl(&opened_state(tmp.path())).expect_err("missing");
    assert!(matches!(
        error,
        ConfigFileCommandError::MissingFile(ConfigFileTarget::Config)
    ));
}

#[test]
fn regenerate_guide_writes_current_resident_config() {
    let tmp = TempDir::new().unwrap();
    write_fixture(tmp.path());
    let state = opened_state(tmp.path());

    let file = regenerate_guide_impl(&state).expect("regenerated");

    assert_eq!(file.id, ConfigFileTarget::Guide);
    assert!(file
        .content
        .contains("# spec-board タスクフォーマットガイド"));
    assert_eq!(
        std::fs::read_to_string(tmp.path().join(".spec-board/GUIDE.md")).unwrap(),
        file.content
    );
}

#[cfg(unix)]
#[test]
fn read_rejects_a_symlinked_spec_board_directory() {
    use std::os::unix::fs::symlink;

    let project = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    write_fixture(outside.path());
    symlink(
        outside.path().join(".spec-board"),
        project.path().join(".spec-board"),
    )
    .unwrap();

    let error = get_config_files_impl(&opened_state(project.path())).expect_err("symlink rejected");

    assert_symlink_boundary(error, &project.path().join(".spec-board"));
}

#[cfg(unix)]
#[test]
fn regenerate_rejects_a_symlinked_spec_board_directory_without_writing_outside() {
    use std::os::unix::fs::symlink;

    let project = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    write_fixture(outside.path());
    let outside_guide = outside.path().join(".spec-board/GUIDE.md");
    let original_guide = std::fs::read_to_string(&outside_guide).unwrap();
    symlink(
        outside.path().join(".spec-board"),
        project.path().join(".spec-board"),
    )
    .unwrap();

    let error = regenerate_guide_impl(&opened_state(project.path())).expect_err("symlink rejected");

    assert_symlink_boundary(error, &project.path().join(".spec-board"));
    assert_eq!(
        std::fs::read_to_string(outside_guide).unwrap(),
        original_guide
    );
}

#[cfg(unix)]
#[test]
fn read_rejects_config_and_guide_leaf_symlinks() {
    use std::os::unix::fs::symlink;

    for target in [ConfigFileTarget::Config, ConfigFileTarget::Guide] {
        let project = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        write_fixture(project.path());
        let file_name = target.file_name();
        let leaf = project.path().join(".spec-board").join(file_name);
        std::fs::remove_file(&leaf).unwrap();
        let outside_leaf = outside.path().join(file_name);
        std::fs::write(&outside_leaf, "outside secret").unwrap();
        symlink(outside_leaf, &leaf).unwrap();

        let error =
            get_config_files_impl(&opened_state(project.path())).expect_err("symlink rejected");

        assert_symlink_boundary(error, &leaf);
    }
}

#[cfg(unix)]
#[test]
fn regenerate_rejects_a_guide_leaf_symlink_without_writing_outside() {
    use std::os::unix::fs::symlink;

    let project = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    write_fixture(project.path());
    let guide = project.path().join(".spec-board/GUIDE.md");
    std::fs::remove_file(&guide).unwrap();
    let outside_guide = outside.path().join("GUIDE.md");
    std::fs::write(&outside_guide, "outside guide").unwrap();
    symlink(&outside_guide, &guide).unwrap();

    let error = regenerate_guide_impl(&opened_state(project.path())).expect_err("symlink rejected");

    assert_symlink_boundary(error, &guide);
    assert_eq!(
        std::fs::read_to_string(outside_guide).unwrap(),
        "outside guide"
    );
}

#[cfg(unix)]
#[test]
fn open_path_resolution_rejects_config_guide_and_labels_leaf_symlinks() {
    use std::os::unix::fs::symlink;

    for target in [
        OpenConfigFileTarget::Config,
        OpenConfigFileTarget::Guide,
        OpenConfigFileTarget::Labels,
    ] {
        let project = TempDir::new().unwrap();
        let outside = TempDir::new().unwrap();
        let spec_board = project.path().join(".spec-board");
        std::fs::create_dir(&spec_board).unwrap();
        let leaf = spec_board.join(target.file_name());
        let outside_leaf = outside.path().join(target.file_name());
        std::fs::write(&outside_leaf, "outside secret").unwrap();
        symlink(outside_leaf, &leaf).unwrap();

        let error = resolve_config_file_path(project.path(), target).expect_err("symlink rejected");

        assert_symlink_boundary(error, &leaf);
    }
}

#[cfg(unix)]
#[test]
fn open_and_reveal_path_resolution_reject_a_symlinked_spec_board_directory() {
    use std::os::unix::fs::symlink;

    let project = TempDir::new().unwrap();
    let outside = TempDir::new().unwrap();
    symlink(outside.path(), project.path().join(".spec-board")).unwrap();

    let open_error = resolve_config_file_path(project.path(), OpenConfigFileTarget::Config)
        .expect_err("symlink rejected");
    let reveal_error = resolve_config_folder_path(project.path()).expect_err("symlink rejected");

    assert_symlink_boundary(open_error, &project.path().join(".spec-board"));
    assert_symlink_boundary(reveal_error, &project.path().join(".spec-board"));
}

#[test]
fn commands_require_an_open_project() {
    let error = get_config_files_impl(&AppState::new()).expect_err("not open");
    assert!(matches!(error, ConfigFileCommandError::NoProjectOpen));
}
