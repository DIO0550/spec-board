use super::*;

/// 実在判定を常に「存在する」に固定する注入。`Unresolved` を含まない
/// ケースでは結果に影響しない。
fn always_exists(_: &Path) -> bool {
    true
}

/// 実在判定を常に「存在しない」に固定する注入。
fn never_exists(_: &Path) -> bool {
    false
}

fn p(path: &str) -> PathBuf {
    PathBuf::from(path)
}

fn paths(expected: &[&str]) -> Vec<PathBuf> {
    expected.iter().map(|path| p(path)).collect()
}

fn ms(millis: u64) -> Duration {
    Duration::from_millis(millis)
}

/// `removed` と `upserted` に同じ path が現れず、各配列内でも重複しないこと。
fn assert_paths_are_disjoint_and_unique(batch: &FileChangeBatch, case: &str) {
    for (label, list) in [("removed", batch.removed()), ("upserted", batch.upserted())] {
        let mut sorted = list.to_vec();
        sorted.sort();
        let before = sorted.len();
        sorted.dedup();
        assert_eq!(
            before,
            sorted.len(),
            "case `{case}`: {label} に重複した path がある: {list:?}"
        );
    }
    for path in batch.removed() {
        assert!(
            !batch.upserted().contains(path),
            "case `{case}`: {} が removed と upserted の両方に現れた",
            path.display()
        );
    }
}

#[test]
fn modified_becomes_a_single_upsert() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Modified(p("a.md")), t0);
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, always_exists)
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(paths(&["a.md"]), batch.upserted());
    assert!(batch.removed().is_empty());
    assert!(!batch.is_rescan());
    assert!(batch.errors().is_empty());
}

#[test]
fn created_becomes_an_upsert() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Created(p("a.md")), t0);
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, always_exists)
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(paths(&["a.md"]), batch.upserted());
    assert!(batch.removed().is_empty());
}

#[test]
fn removed_becomes_a_removal() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Removed(p("a.md")), t0);
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, never_exists)
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(paths(&["a.md"]), batch.removed());
    assert!(batch.upserted().is_empty());
}

#[test]
fn renamed_registers_from_and_to_as_independent_entries() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(
        &FsEvent::Renamed {
            from: p("old.md"),
            to: p("new.md"),
        },
        t0,
    );
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, always_exists)
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(paths(&["old.md"]), batch.removed());
    assert_eq!(paths(&["new.md"]), batch.upserted());
}

#[test]
fn rename_followed_by_modify_keeps_the_removal_of_the_old_path() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(
        &FsEvent::Renamed {
            from: p("old.md"),
            to: p("new.md"),
        },
        t0,
    );
    pending.record(&FsEvent::Modified(p("new.md")), t0 + ms(10));
    let batch = pending
        .drain_due_with(t0 + ms(10) + DEBOUNCE_DURATION, always_exists)
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(
        paths(&["old.md"]),
        batch.removed(),
        "後続の Modified(new) で from の削除が失われてはならない"
    );
    assert_eq!(paths(&["new.md"]), batch.upserted());
    assert_paths_are_disjoint_and_unique(&batch, "rename → modify");
}

#[test]
fn reduction_table() {
    struct Case {
        name: &'static str,
        events: Vec<FsEvent>,
        expected_removed: Vec<&'static str>,
        expected_upserted: Vec<&'static str>,
    }

    let cases = vec![
        Case {
            name: "create → remove は削除に畳まれる",
            events: vec![FsEvent::Created(p("a.md")), FsEvent::Removed(p("a.md"))],
            expected_removed: vec!["a.md"],
            expected_upserted: vec![],
        },
        Case {
            name: "remove → create は upsert に畳まれる",
            events: vec![FsEvent::Removed(p("a.md")), FsEvent::Created(p("a.md"))],
            expected_removed: vec![],
            expected_upserted: vec!["a.md"],
        },
        Case {
            name: "repeated modify は 1 エントリに畳まれる",
            events: vec![
                FsEvent::Modified(p("a.md")),
                FsEvent::Modified(p("a.md")),
                FsEvent::Modified(p("a.md")),
            ],
            expected_removed: vec![],
            expected_upserted: vec!["a.md"],
        },
        Case {
            name: "rename → modify は from の削除を保つ",
            events: vec![
                FsEvent::Renamed {
                    from: p("old.md"),
                    to: p("new.md"),
                },
                FsEvent::Modified(p("new.md")),
            ],
            expected_removed: vec!["old.md"],
            expected_upserted: vec!["new.md"],
        },
        Case {
            name: "atomic save 列は tmp 削除と本体 upsert になる",
            events: vec![
                FsEvent::Created(p("t.md.tmp")),
                FsEvent::Renamed {
                    from: p("t.md.tmp"),
                    to: p("t.md"),
                },
                FsEvent::Modified(p("t.md")),
            ],
            expected_removed: vec!["t.md.tmp"],
            expected_upserted: vec!["t.md"],
        },
        Case {
            name: "modify → rename(from) は Removed が後勝ちする",
            events: vec![
                FsEvent::Modified(p("a.md")),
                FsEvent::Renamed {
                    from: p("a.md"),
                    to: p("b.md"),
                },
            ],
            expected_removed: vec!["a.md"],
            expected_upserted: vec!["b.md"],
        },
    ];

    for c in cases {
        let t0 = Instant::now();
        let mut pending = PendingChanges::new();
        let mut last = t0;
        for (index, event) in c.events.iter().enumerate() {
            last = t0 + ms(5 * index as u64);
            pending.record(event, last);
        }

        let batch = pending
            .drain_due_with(last + DEBOUNCE_DURATION, always_exists)
            .unwrap_or_else(|| panic!("case `{}` failed: batch が返らなかった", c.name));

        assert_eq!(
            paths(&c.expected_removed),
            batch.removed(),
            "case `{}` failed (removed)",
            c.name
        );
        assert_eq!(
            paths(&c.expected_upserted),
            batch.upserted(),
            "case `{}` failed (upserted)",
            c.name
        );
        assert_paths_are_disjoint_and_unique(&batch, c.name);
    }
}

#[test]
fn drain_due_includes_an_entry_whose_deadline_equals_now() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Modified(p("a.md")), t0);
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, always_exists)
        .expect("deadline == now は取り出し対象");

    assert_eq!(paths(&["a.md"]), batch.upserted());
}

#[test]
fn drain_due_keeps_entries_whose_deadline_has_not_arrived() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Modified(p("a.md")), t0);

    assert!(
        pending
            .drain_due_with(t0 + DEBOUNCE_DURATION - ms(1), always_exists)
            .is_none(),
        "deadline 未到来では取り出さない"
    );
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, always_exists)
        .expect("未到来のエントリは保留に残り、deadline 到来後に取り出せるべき");
    assert_eq!(paths(&["a.md"]), batch.upserted());
}

#[test]
fn draining_an_empty_pending_yields_nothing() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    assert!(
        pending.drain_due_with(t0, always_exists).is_none(),
        "保留が空なら空 batch を作らない"
    );
    assert!(
        pending.drain_all_with(always_exists).is_none(),
        "保留が空なら空 batch を作らない"
    );
}

#[test]
fn recording_the_same_path_again_slides_the_deadline() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Modified(p("a.md")), t0);
    pending.record(&FsEvent::Modified(p("a.md")), t0 + ms(50));

    assert!(
        pending
            .drain_due_with(t0 + DEBOUNCE_DURATION, always_exists)
            .is_none(),
        "2 回目の記録で deadline が延長されているべき"
    );
    let batch = pending
        .drain_due_with(t0 + ms(50) + DEBOUNCE_DURATION, always_exists)
        .expect("延長後の deadline では取り出せるべき");
    assert_eq!(paths(&["a.md"]), batch.upserted());
}

#[test]
fn drain_order_is_deadline_then_path_ascending() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Modified(p("z.md")), t0);
    pending.record(&FsEvent::Modified(p("b.md")), t0 + ms(20));
    pending.record(&FsEvent::Modified(p("a.md")), t0 + ms(20));

    let batch = pending
        .drain_due_with(t0 + ms(200), always_exists)
        .expect("全件 deadline 到来済み");

    assert_eq!(
        paths(&["z.md", "a.md", "b.md"]),
        batch.upserted(),
        "deadline 昇順、同点は path 昇順で並ぶべき"
    );
}

#[test]
fn other_resolves_to_upserted_when_the_path_exists() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Other(p("a.md")), t0);
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, |path| path == Path::new("a.md"))
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(paths(&["a.md"]), batch.upserted());
    assert!(batch.removed().is_empty());
}

#[test]
fn other_resolves_to_removed_when_the_path_is_gone() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Other(p("a.md")), t0);
    let batch = pending
        .drain_due_with(t0 + DEBOUNCE_DURATION, never_exists)
        .expect("deadline 到来後は batch が返るべき");

    assert_eq!(paths(&["a.md"]), batch.removed());
    assert!(batch.upserted().is_empty());
}

#[test]
fn drain_all_takes_every_entry_regardless_of_deadline() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    pending.record(&FsEvent::Modified(p("a.md")), t0);
    pending.record(&FsEvent::Removed(p("b.md")), t0 + ms(50));

    let batch = pending
        .drain_all_with(never_exists)
        .expect("deadline 未到来でも全件取り出すべき");

    assert_eq!(paths(&["a.md"]), batch.upserted());
    assert_eq!(paths(&["b.md"]), batch.removed());
    assert!(
        pending.drain_all_with(never_exists).is_none(),
        "取り出した後の保留は空になるべき"
    );
}

#[test]
fn next_wait_reflects_the_nearest_deadline() {
    let t0 = Instant::now();
    let mut pending = PendingChanges::new();

    assert_eq!(
        None,
        pending.next_wait(t0),
        "保留が無ければ無限ブロックを表す None"
    );

    pending.record(&FsEvent::Modified(p("a.md")), t0);

    assert_eq!(Some(ms(60)), pending.next_wait(t0 + ms(40)));
    assert_eq!(
        Some(Duration::ZERO),
        pending.next_wait(t0 + ms(200)),
        "経過済みの deadline は負にならず ZERO に飽和する"
    );
}

#[cfg(debug_assertions)]
#[test]
#[should_panic]
fn record_panics_in_debug_when_given_a_bypass_event() {
    let mut pending = PendingChanges::new();
    pending.record(&FsEvent::Rescan, Instant::now());
}
