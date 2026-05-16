//! `TaskIo` 契約 golden test。`FsTaskIo` と `InMemoryTaskIo` の双方に対して
//! 同一アサートを実行し、観測挙動が一致することを保証する。

use std::io::{self, ErrorKind};
use std::path::Path;

use tempfile::TempDir;

use super::{FsTaskIo, InMemoryTaskIo, TaskIo, TaskIoError};

/// `FsTaskIo` / `InMemoryTaskIo` の両方に対して同じテスト本体を実行するヘルパ。
fn with_both<F>(test: F)
where
    F: Fn(&dyn TaskIo, &Path),
{
    // FsTaskIo: 実 tempdir 上で評価
    let tmp = TempDir::new().expect("create tempdir for FsTaskIo");
    test(&FsTaskIo, tmp.path());

    // InMemoryTaskIo: base dir を予め登録した状態で評価
    let mem_tmp = TempDir::new().expect("create tempdir for InMemoryTaskIo base");
    let mem = InMemoryTaskIo::new();
    mem.pre_register_dir(mem_tmp.path());
    test(&mem, mem_tmp.path());
}

fn io_kind(err: &TaskIoError) -> ErrorKind {
    match err {
        TaskIoError::Io(inner) => inner.kind(),
    }
}

#[test]
fn write_new_then_read_returns_same_bytes() {
    with_both(|io, base| {
        let path = base.join("a.md");
        io.write_new(&path, b"hello").expect("write_new ok");
        let read = io.read(&path).expect("read ok");
        assert_eq!(b"hello".to_vec(), read);
    });
}

#[test]
fn write_new_rejects_existing_file() {
    with_both(|io, base| {
        let path = base.join("dup.md");
        io.write_new(&path, b"first").expect("seed");
        let err = io
            .write_new(&path, b"second")
            .expect_err("duplicate should fail");
        assert_eq!(ErrorKind::AlreadyExists, io_kind(&err));
    });
}

#[test]
fn write_new_rejects_existing_file_preserves_existing_content() {
    with_both(|io, base| {
        let path = base.join("preserve.md");
        io.write_new(&path, b"original").expect("seed");
        let _ = io
            .write_new(&path, b"different")
            .expect_err("duplicate should fail");
        let read = io.read(&path).expect("still readable");
        assert_eq!(
            b"original".to_vec(),
            read,
            "existing content must be preserved"
        );
    });
}

#[test]
fn write_new_rejects_when_parent_missing() {
    with_both(|io, base| {
        let path = base.join("missing-dir").join("child.md");
        let err = io
            .write_new(&path, b"x")
            .expect_err("missing parent should fail");
        // kind は OS 依存（Linux: NotFound、macOS: 同じく NotFound 等）。
        // Err 自体が返ることだけ assert する。
        let _ = err;
    });
}

#[test]
fn write_new_rejects_when_parent_is_file() {
    with_both(|io, base| {
        let parent_as_file = base.join("not-a-dir");
        io.write_new(&parent_as_file, b"stub")
            .expect("seed parent as file");
        let path = parent_as_file.join("child.md");
        let err = io
            .write_new(&path, b"x")
            .expect_err("parent-as-file should fail");
        let _ = err;
    });
}

#[test]
fn write_new_rejects_when_target_is_dir() {
    with_both(|io, base| {
        let dir = base.join("target-dir");
        io.ensure_dir(&dir).expect("seed dir");
        let err = io
            .write_new(&dir, b"x")
            .expect_err("target-is-dir should fail");
        let _ = err;
    });
}

#[test]
fn remove_existing_file_succeeds() {
    with_both(|io, base| {
        let path = base.join("removable.md");
        io.write_new(&path, b"x").expect("seed");
        io.remove(&path).expect("remove ok");
        let err = io.read(&path).expect_err("should be gone");
        assert_eq!(ErrorKind::NotFound, io_kind(&err));
    });
}

#[test]
fn remove_rejects_nonexistent() {
    with_both(|io, base| {
        let path = base.join("ghost.md");
        let err = io.remove(&path).expect_err("nonexistent should fail");
        assert_eq!(ErrorKind::NotFound, io_kind(&err));
    });
}

#[test]
fn remove_rejects_directory() {
    with_both(|io, base| {
        let dir = base.join("dir-to-remove");
        io.ensure_dir(&dir).expect("seed dir");
        let err = io.remove(&dir).expect_err("removing dir should fail");
        let _ = err;
    });
}

#[test]
fn read_nonexistent_returns_not_found() {
    with_both(|io, base| {
        let path = base.join("missing.md");
        let err = io.read(&path).expect_err("missing should fail");
        assert_eq!(ErrorKind::NotFound, io_kind(&err));
    });
}

#[test]
fn read_rejects_directory() {
    with_both(|io, base| {
        let dir = base.join("dir-to-read");
        io.ensure_dir(&dir).expect("seed dir");
        let err = io.read(&dir).expect_err("reading dir should fail");
        let _ = err;
    });
}

#[test]
fn ensure_dir_idempotent_for_existing_dir() {
    with_both(|io, base| {
        let dir = base.join("idempotent");
        io.ensure_dir(&dir).expect("first ensure");
        io.ensure_dir(&dir)
            .expect("second ensure must be idempotent");
    });
}

#[test]
fn ensure_dir_creates_intermediate_dirs() {
    with_both(|io, base| {
        let nested = base.join("a").join("b").join("c");
        io.ensure_dir(&nested)
            .expect("ensure_dir creates intermediates");
        // 中間ディレクトリ配下にファイルを書ければ実際に作られている。
        let path = nested.join("leaf.md");
        io.write_new(&path, b"leaf").expect("write into nested dir");
    });
}

#[test]
fn ensure_dir_rejects_when_intermediate_component_is_file() {
    with_both(|io, base| {
        // 中間 component `mid` をファイルとして配置 → その配下を ensure_dir で
        // 作ろうとすると std::fs::create_dir_all は失敗する。InMemoryTaskIo も
        // 同様に Err を返さなければ契約に反する。
        let mid_as_file = base.join("mid");
        io.write_new(&mid_as_file, b"stub")
            .expect("seed mid as file");
        let nested = mid_as_file.join("inner").join("leaf");
        let err = io
            .ensure_dir(&nested)
            .expect_err("intermediate-file ancestor should fail");
        let _ = err;
    });
}

#[test]
fn ensure_dir_rejects_when_path_is_file() {
    with_both(|io, base| {
        let as_file = base.join("file-not-dir");
        io.write_new(&as_file, b"x").expect("seed file");
        let err = io
            .ensure_dir(&as_file)
            .expect_err("ensure_dir on file should fail");
        let _ = err;
    });
}

#[test]
fn write_new_partial_write_cleanup_not_observable_on_normal_path() {
    // 通常パスでは partial-write は発生しないため、契約として「成功後の
    // read で同一バイトが取れる」だけを担保する。adapter 実装側の `write_all`
    // 失敗パスは IO 障害ハードウェアが必要で再現困難なので、ロジック分岐の
    // 存在のみコード review で担保し、ここでは success path を検証する。
    with_both(|io, base| {
        let path = base.join("normal.md");
        io.write_new(&path, b"complete").expect("write ok");
        assert_eq!(b"complete".to_vec(), io.read(&path).expect("read"));
    });
}

#[test]
fn write_existing_overwrites_existing_file_with_new_bytes() {
    with_both(|io, base| {
        let path = base.join("update-target.md");
        io.write_new(&path, b"original").expect("seed");
        io.write_existing(&path, b"updated").expect("overwrite ok");
        let read = io.read(&path).expect("read ok");
        assert_eq!(b"updated".to_vec(), read);
    });
}

#[test]
fn write_existing_creates_when_path_missing_following_std_fs_write_semantics() {
    with_both(|io, base| {
        let path = base.join("brand-new.md");
        io.write_existing(&path, b"fresh")
            .expect("write_existing ok");
        let read = io.read(&path).expect("read ok");
        assert_eq!(b"fresh".to_vec(), read);
    });
}

#[test]
fn write_existing_rejects_when_target_is_dir() {
    with_both(|io, base| {
        let dir = base.join("dir-as-target");
        io.ensure_dir(&dir).expect("seed dir");
        let err = io
            .write_existing(&dir, b"x")
            .expect_err("target-is-dir should fail");
        let _ = err;
    });
}

#[test]
fn task_io_error_display_matches_inner_io_error_display() {
    // `From<TaskIoError> for CreateTaskCommandError` で Display を素通しさせる
    // ための前提条件として、`TaskIoError::Io(_)` の Display が inner と完全
    // 一致することを担保する。
    let inner = io::Error::from(ErrorKind::AlreadyExists);
    let inner_str = inner.to_string();
    let wrapped = TaskIoError::from(inner);
    assert_eq!(inner_str, wrapped.to_string());
}
