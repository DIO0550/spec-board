import { expect, test } from "vitest";
import { WatcherGate } from "../index";
import {
  diagnosticEnvelope,
  envelope,
  resyncEnvelope,
  SESSION_PAYLOAD,
  session,
} from "./watcherGateFixtures";

const synced = () => WatcherGate.init(session());

// 行 0
test("init 前に届いた envelope は not-initialized として捨てる", () => {
  const step = WatcherGate.receive(WatcherGate.initial, envelope());

  expect(step.decision).toEqual({
    kind: "discard",
    reason: "not-initialized",
  });
  expect(step.state).toBe(WatcherGate.initial);
});

// 行 10
test("連番かつ revision が進んだ envelope は apply され S と R の両方が更新される", () => {
  const step = WatcherGate.receive(synced(), envelope());

  expect(step.decision.kind).toBe("apply");
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq + 1);
  expect(step.state.lastRevision).toBe(SESSION_PAYLOAD.revision + 1);
});

// 行 1
test("projectKey 不一致は foreign-project として捨て、S を進めない", () => {
  const step = WatcherGate.receive(
    synced(),
    envelope({ projectKey: "/home/user/other" }),
  );

  expect(step.decision).toEqual({ kind: "discard", reason: "foreign-project" });
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq);
});

// 行 2
test.each([
  ["旧世代", 2],
  ["新世代", 4],
])("generation 不一致（%s）は stale-generation として捨て、S を進めない", (_label, generation) => {
  const step = WatcherGate.receive(synced(), envelope({ generation }));

  expect(step.decision).toEqual({
    kind: "discard",
    reason: "stale-generation",
  });
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq);
});

// 行 4
test.each([
  ["revision が同値", SESSION_PAYLOAD.revision],
  ["revision が後退", SESSION_PAYLOAD.revision - 1],
])("診断は %s でも apply され、S だけ進んで R は不変", (_label, revision) => {
  const step = WatcherGate.receive(
    synced(),
    diagnosticEnvelope({ revision, eventSeq: SESSION_PAYLOAD.eventSeq + 5 }),
  );

  expect(step.decision.kind).toBe("apply");
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq + 5);
  expect(step.state.lastRevision).toBe(SESSION_PAYLOAD.revision);
});

// 行 4（S 以下でも apply）
test("eventSeq が S 以下の診断でも apply される", () => {
  const step = WatcherGate.receive(
    synced(),
    diagnosticEnvelope({ eventSeq: SESSION_PAYLOAD.eventSeq - 3 }),
  );

  expect(step.decision.kind).toBe("apply");
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq);
});

// 行 4（resyncing 中でも即時 apply）
test("resyncing 中の診断は buffer されず即時 apply される", () => {
  const resyncing = WatcherGate.receive(synced(), resyncEnvelope()).state;

  const step = WatcherGate.receive(resyncing, diagnosticEnvelope());

  expect(step.decision.kind).toBe("apply");
  expect(step.state.buffer).toHaveLength(0);
});

// 行 3
test("同じ changeId の診断が 2 回届いたら 2 回目は duplicate-event として捨てる", () => {
  const first = WatcherGate.receive(synced(), diagnosticEnvelope());

  const second = WatcherGate.receive(first.state, diagnosticEnvelope());

  expect(second.decision).toEqual({
    kind: "discard",
    reason: "duplicate-event",
  });
});

// 行 3（リングバッファ長）
test("17 件の異なる診断の後に 1 件目を再送すると apply される", () => {
  const firstEnvelope = diagnosticEnvelope({ changeId: "3-100" });
  let state = WatcherGate.receive(synced(), firstEnvelope).state;
  for (let index = 1; index <= 16; index += 1) {
    state = WatcherGate.receive(
      state,
      diagnosticEnvelope({ changeId: `3-${100 + index}` }),
    ).state;
  }

  const step = WatcherGate.receive(state, firstEnvelope);

  expect(step.decision.kind).toBe("apply");
});

// 行 5
test("eventSeq が S 以下の cache 変更 event は duplicate-event として捨て、S も R も進めない", () => {
  const step = WatcherGate.receive(
    synced(),
    envelope({ eventSeq: SESSION_PAYLOAD.eventSeq }),
  );

  expect(step.decision).toEqual({ kind: "discard", reason: "duplicate-event" });
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq);
  expect(step.state.lastRevision).toBe(SESSION_PAYLOAD.revision);
});

// 行 8
test.each([
  ["revision が同値", SESSION_PAYLOAD.revision],
  ["revision が後退", SESSION_PAYLOAD.revision - 1],
])("追い越された古い cache 変更（%s）は stale-revision として捨てるが S は進める", (_label, revision) => {
  const step = WatcherGate.receive(synced(), envelope({ revision }));

  expect(step.decision).toEqual({
    kind: "discard",
    reason: "stale-revision",
  });
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq + 1);
  expect(step.state.lastRevision).toBe(SESSION_PAYLOAD.revision);
});

// 行 8 の回帰
test("stale-revision の直後に届いた連番 envelope は gap と誤判定されず apply される", () => {
  const stale = WatcherGate.receive(
    synced(),
    envelope({ revision: SESSION_PAYLOAD.revision }),
  );

  const step = WatcherGate.receive(
    stale.state,
    envelope({ eventSeq: SESSION_PAYLOAD.eventSeq + 2 }),
  );

  expect(step.decision.kind).toBe("apply");
});

// 行 7
test("eventSeq が 1 つ飛ぶと event-gap で resync に入り、その envelope は buffer される", () => {
  const step = WatcherGate.receive(
    synced(),
    envelope({ eventSeq: SESSION_PAYLOAD.eventSeq + 2 }),
  );

  expect(step.decision).toEqual({ kind: "resync", reason: "event-gap" });
  expect(step.state.status).toBe("resyncing");
  expect(step.state.buffer).toHaveLength(1);
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq);
});

// 行 9
test("resync-required は rescan として resync に入り、S は進み R は不変", () => {
  const step = WatcherGate.receive(synced(), resyncEnvelope());

  expect(step.decision).toEqual({ kind: "resync", reason: "rescan" });
  expect(step.state.status).toBe("resyncing");
  expect(step.state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq + 1);
  expect(step.state.lastRevision).toBe(SESSION_PAYLOAD.revision);
  expect(step.state.buffer).toHaveLength(0);
});

test("init は応答 session を baseline として取り込む", () => {
  const state = WatcherGate.init(session());

  expect(state.lastRevision).toBe(SESSION_PAYLOAD.revision);
  expect(state.lastEventSeq).toBe(SESSION_PAYLOAD.eventSeq);
  expect(state.status).toBe("synced");
  expect(state.buffer).toHaveLength(0);
});

// 行 4 の回帰: 診断が cache 変更の欠番を隠さない
test("診断より前に欠けた cache 変更がある場合、診断は apply しつつ resync も要求する", () => {
  const step = WatcherGate.receive(
    synced(),
    diagnosticEnvelope({ eventSeq: SESSION_PAYLOAD.eventSeq + 3 }),
  );

  expect(step.decision.kind).toBe("apply");
  expect(
    step.decision.kind === "apply" ? step.decision.alsoResync : undefined,
  ).toBe("event-gap");
  expect(step.state.status).toBe("resyncing");
});

test("連番の診断は resync を誘発しない", () => {
  const step = WatcherGate.receive(
    synced(),
    diagnosticEnvelope({ eventSeq: SESSION_PAYLOAD.eventSeq + 1 }),
  );

  expect(step.decision.kind).toBe("apply");
  expect(
    step.decision.kind === "apply" ? step.decision.alsoResync : undefined,
  ).toBeUndefined();
  expect(step.state.status).toBe("synced");
});

test("resyncing 中の飛んだ診断は apply されるが二重に resync を要求しない", () => {
  const resyncing = WatcherGate.receive(synced(), resyncEnvelope()).state;

  const step = WatcherGate.receive(
    resyncing,
    diagnosticEnvelope({ eventSeq: SESSION_PAYLOAD.eventSeq + 9 }),
  );

  expect(step.decision.kind).toBe("apply");
  expect(
    step.decision.kind === "apply" ? step.decision.alsoResync : undefined,
  ).toBeUndefined();
});
