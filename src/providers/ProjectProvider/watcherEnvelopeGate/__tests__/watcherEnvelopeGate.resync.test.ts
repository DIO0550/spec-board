import { expect, test } from "vitest";
import { WATCHER_BUFFER_LIMIT, WatcherGate } from "../index";
import {
  diagnosticEnvelope,
  envelope,
  resyncEnvelope,
  SESSION_PAYLOAD,
  session,
} from "./watcherGateFixtures";

const SEQ = SESSION_PAYLOAD.eventSeq;
const REV = SESSION_PAYLOAD.revision;

/** resync-required を 1 件受けて resyncing に入った状態。S は SEQ + 1。 */
const resyncing = () =>
  WatcherGate.receive(WatcherGate.init(session()), resyncEnvelope()).state;

// 行 6
test("resyncing 中の cache 変更 event は buffer され S も R も動かない", () => {
  const state = resyncing();

  const step = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 2, revision: REV + 5 }),
  );

  expect(step.decision).toEqual({ kind: "buffer" });
  expect(step.state.buffer).toHaveLength(1);
  expect(step.state.lastEventSeq).toBe(SEQ + 1);
  expect(step.state.lastRevision).toBe(REV);
});

test("snapshotApplied は応答 session で R と S の両方の baseline を取り直す", () => {
  const applied = WatcherGate.snapshotApplied(
    resyncing(),
    session({ revision: 99, eventSeq: 50 }),
  );

  expect(applied.accepted).toBe(true);
  expect(applied.state.lastRevision).toBe(99);
  expect(applied.state.lastEventSeq).toBe(50);
  expect(applied.state.status).toBe("synced");
});

test("buffer が全て stale で破棄されても次の連番 envelope は apply される", () => {
  const buffered = WatcherGate.receive(
    resyncing(),
    envelope({ eventSeq: SEQ + 2, revision: REV + 1 }),
  ).state;
  const applied = WatcherGate.snapshotApplied(
    buffered,
    session({ revision: 99, eventSeq: SEQ + 2 }),
  );

  const next = WatcherGate.receive(
    applied.state,
    envelope({ eventSeq: SEQ + 3, revision: 100 }),
  );

  expect(applied.decisions.map((decision) => decision.kind)).toEqual([
    "discard",
  ]);
  expect(applied.resyncRequired).toBe(false);
  expect(next.decision.kind).toBe("apply");
});

test("buffer の畳み込みは snapshot より古い分を捨て、新しい分だけ apply する", () => {
  let state = resyncing();
  state = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 2, revision: 50 }),
  ).state;
  state = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 3, revision: 60 }),
  ).state;

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 55, eventSeq: SEQ + 1 }),
  );

  expect(applied.decisions.map((decision) => decision.kind)).toEqual([
    "discard",
    "apply",
  ]);
  expect(applied.state.status).toBe("synced");
  expect(applied.resyncRequired).toBe(false);
});

test("応答 session の identity が現行と違えば採用せず状態も変えない", () => {
  const state = resyncing();

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ generation: 4, revision: 99, eventSeq: 50 }),
  );

  expect(applied.accepted).toBe(false);
  expect(applied.state).toBe(state);
  expect(applied.decisions).toHaveLength(0);
});

test("buffer が空のままでも snapshot 適用で synced に戻る", () => {
  const applied = WatcherGate.snapshotApplied(
    resyncing(),
    session({ revision: 99, eventSeq: SEQ + 1 }),
  );

  expect(applied.state.status).toBe("synced");
  expect(applied.state.buffer).toHaveLength(0);
  expect(applied.resyncRequired).toBe(false);
});

test("buffer が上限を超えると破棄され、snapshot 適用時に再 resync を要求する", () => {
  let state = resyncing();
  for (let index = 0; index <= WATCHER_BUFFER_LIMIT; index += 1) {
    state = WatcherGate.receive(
      state,
      envelope({ eventSeq: SEQ + 2 + index, revision: REV + 1 + index }),
    ).state;
  }

  expect(state.bufferOverflowed).toBe(true);
  expect(state.buffer).toHaveLength(0);

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 999, eventSeq: SEQ + 1 }),
  );

  expect(applied.resyncRequired).toBe(true);
  expect(applied.state.bufferOverflowed).toBe(false);
});

test("buffer 内の seq が非連続なら畳み込みが gap を再検出する", () => {
  let state = resyncing();
  state = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 5, revision: 100 }),
  ).state;

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 50, eventSeq: SEQ + 1 }),
  );

  expect(applied.resyncRequired).toBe(true);
  expect(applied.state.status).toBe("resyncing");
});

test("buffer 内の resync-required は畳み込みで再び resyncing に入る", () => {
  let state = resyncing();
  state = WatcherGate.receive(
    state,
    resyncEnvelope({ eventSeq: SEQ + 2, revision: 100 }),
  ).state;

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 50, eventSeq: SEQ + 1 }),
  );

  expect(applied.resyncRequired).toBe(true);
  expect(applied.state.status).toBe("resyncing");
});

test("resyncFailed は synced に戻し buffer と overflow フラグをリセットする", () => {
  let state = resyncing();
  state = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 2, revision: 100 }),
  ).state;

  const recovered = WatcherGate.resyncFailed(state);

  expect(recovered.status).toBe("synced");
  expect(recovered.buffer).toHaveLength(0);
  expect(recovered.bufferOverflowed).toBe(false);
});

test("resyncFailed の直後に飛んだ envelope が届くと再び resync が返る", () => {
  const recovered = WatcherGate.resyncFailed(resyncing());

  const step = WatcherGate.receive(
    recovered,
    envelope({ eventSeq: SEQ + 3, revision: 100 }),
  );

  expect(step.decision).toEqual({ kind: "resync", reason: "event-gap" });
});

test("再取得が成功したあとの連番 envelope は余計な resync を誘発しない", () => {
  const applied = WatcherGate.snapshotApplied(
    resyncing(),
    session({ revision: 50, eventSeq: SEQ + 1 }),
  );

  const step = WatcherGate.receive(
    applied.state,
    envelope({ eventSeq: SEQ + 2, revision: 100 }),
  );

  expect(step.decision.kind).toBe("apply");
});

test("新しい session で init すると buffer / status / カウンタがリセットされる", () => {
  let state = resyncing();
  state = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 2, revision: 100 }),
  ).state;

  const reinitialized = WatcherGate.init(
    session({ generation: 4, revision: 0, eventSeq: 0 }),
  );

  expect(reinitialized.status).toBe("synced");
  expect(reinitialized.buffer).toHaveLength(0);
  expect(reinitialized.bufferOverflowed).toBe(false);
  expect(reinitialized.lastRevision).toBe(0);
  expect(reinitialized.lastEventSeq).toBe(0);
  expect(reinitialized.recentDiagnosticIds).toHaveLength(0);
});

test("resyncStarted は status を resyncing にして以後の cache 変更を buffer させる", () => {
  const state = WatcherGate.resyncStarted(WatcherGate.init(session()));

  const step = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 1, revision: REV + 1 }),
  );

  expect(state.status).toBe("resyncing");
  expect(step.decision).toEqual({ kind: "buffer" });
});

test("resyncStarted は buffer と watermark を保持する（既に resyncing なら冪等）", () => {
  let state = resyncing();
  state = WatcherGate.receive(
    state,
    envelope({ eventSeq: SEQ + 2, revision: REV + 5 }),
  ).state;

  const restarted = WatcherGate.resyncStarted(state);

  expect(restarted.buffer).toHaveLength(1);
  expect(restarted.lastEventSeq).toBe(state.lastEventSeq);
  expect(restarted.lastRevision).toBe(state.lastRevision);
});

// ───────── resyncPending（未解決の再取得を落とさない） ─────────

test("resyncFailed は「まだ再取得が必要」という事実を保持する", () => {
  const failed = WatcherGate.resyncFailed(resyncing());

  expect(failed.resyncPending).toBe(true);
});

test("resync 失敗の直後は連番 envelope でも再取得に入る", () => {
  const failed = WatcherGate.resyncFailed(resyncing());

  const step = WatcherGate.receive(
    failed,
    envelope({ eventSeq: SEQ + 2, revision: REV + 1 }),
  );

  expect(step.decision).toEqual({ kind: "resync", reason: "event-gap" });
  expect(step.state.status).toBe("resyncing");
  expect(step.state.buffer).toHaveLength(1);
});

test("resync 失敗後の診断も再取得を誘発する", () => {
  const failed = WatcherGate.resyncFailed(resyncing());

  const step = WatcherGate.receive(
    failed,
    diagnosticEnvelope({ eventSeq: SEQ + 2 }),
  );

  expect(step.decision.kind).toBe("apply");
  expect(
    step.decision.kind === "apply" ? step.decision.alsoResync : undefined,
  ).toBe("event-gap");
});

test("resyncStarted は buffer を始めるだけで未解決フラグは下ろさない", () => {
  const failed = WatcherGate.resyncFailed(resyncing());

  const started = WatcherGate.resyncStarted(failed);

  expect(started.status).toBe("resyncing");
  expect(started.resyncPending).toBe(true);
});

test("実際の発行（resyncIssued）で未解決フラグが下り、成功後も立たない", () => {
  const failed = WatcherGate.resyncFailed(resyncing());

  const issued = WatcherGate.resyncIssued(WatcherGate.resyncStarted(failed));
  const applied = WatcherGate.snapshotApplied(
    issued,
    session({ revision: 99, eventSeq: 50 }),
  );

  expect(issued.resyncPending).toBe(false);
  expect(applied.state.resyncPending).toBe(false);
  expect(applied.resyncRequired).toBe(false);
});

test("barrier 待ち中に立った latch は、これから投げる取得 1 本で収束する", () => {
  // 実際の順序: resyncStarted（buffer 開始）→ barrier 待ち → resyncIssued（発行）。
  let state = WatcherGate.resyncStarted(WatcherGate.init(session()));
  // barrier 待ちのあいだに診断が欠番を露呈した状況。
  state = WatcherGate.receive(
    state,
    diagnosticEnvelope({ eventSeq: SEQ + 9 }),
  ).state;
  state = WatcherGate.resyncIssued(state);

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 99, eventSeq: SEQ + 9 }),
  );

  // barrier のあとに投げた snapshot はその欠落も含むので、2 本目は不要。
  expect(applied.resyncRequired).toBe(false);
});

test("発行後に立った latch は 2 本目として回収される", () => {
  let state = WatcherGate.resyncIssued(
    WatcherGate.resyncStarted(WatcherGate.init(session())),
  );
  state = WatcherGate.receive(
    state,
    diagnosticEnvelope({ eventSeq: SEQ + 9 }),
  ).state;

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 99, eventSeq: SEQ + 9 }),
  );

  expect(applied.resyncRequired).toBe(true);
});

test("resync 中に診断が欠番を露呈したら、その resync 完了後にもう一度取り直す", () => {
  let state = WatcherGate.resyncIssued(WatcherGate.resyncStarted(resyncing()));
  state = WatcherGate.receive(
    state,
    diagnosticEnvelope({ eventSeq: SEQ + 9 }),
  ).state;

  const applied = WatcherGate.snapshotApplied(
    state,
    session({ revision: 99, eventSeq: SEQ + 9 }),
  );

  expect(applied.resyncRequired).toBe(true);
  expect(applied.state.resyncPending).toBe(false);
});
