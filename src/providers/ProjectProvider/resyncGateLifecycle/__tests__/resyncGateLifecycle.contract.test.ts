import { expect, test } from "vitest";
import { WatcherSession } from "@/domains/watcher-session";
import { WatcherGate } from "../../watcherEnvelopeGate";
import { ResyncGateLifecycle } from "../index";

const GENERATION = 3;

/**
 * baseline session を組み立てる。
 * @param overrides 差し替えるフィールド
 * @returns WatcherSession
 */
const session = (
  overrides: Partial<{ projectKey: string; generation: number }> = {},
): WatcherSession =>
  WatcherSession.fromPayload({
    projectKey: "/home/user/specs",
    generation: GENERATION,
    revision: 42,
    eventSeq: 17,
    ...overrides,
  });

test("start は status を resyncing にする", () => {
  const gate = { current: WatcherGate.init(session()) };

  ResyncGateLifecycle.forRequest(gate, GENERATION).start();

  expect(gate.current.status).toBe("resyncing");
});

test("issue は未解決 latch を下ろす", () => {
  const gate = {
    current: { ...WatcherGate.init(session()), resyncPending: true },
  };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);

  lifecycle.start();
  lifecycle.issue();

  expect(gate.current.resyncPending).toBe(false);
});

test("issue のあとに立った債務は apply が再取得として拾う", () => {
  const gate = {
    current: { ...WatcherGate.init(session()), resyncPending: true },
  };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);
  lifecycle.start();
  lifecycle.issue();
  gate.current = { ...gate.current, resyncPending: true };

  const applied = lifecycle.apply(session());

  expect(applied?.resyncRequired).toBe(true);
});

test("apply 成功で gate が差し替わる", () => {
  const gate = { current: WatcherGate.init(session()) };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);
  lifecycle.start();

  const applied = lifecycle.apply(session());

  expect(applied?.accepted).toBe(true);
  expect(gate.current.status).toBe("synced");
});

test("apply 後の release は gate に触らない", () => {
  const gate = { current: WatcherGate.init(session()) };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);
  lifecycle.start();
  lifecycle.apply(session());
  const afterApply = gate.current;

  lifecycle.release();

  expect(gate.current).toBe(afterApply);
});

test("apply せずに release すると resyncPending を立てたまま synced に戻る", () => {
  const gate = { current: WatcherGate.init(session()) };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);
  lifecycle.start();

  lifecycle.release();

  expect(gate.current.status).toBe("synced");
  expect(gate.current.resyncPending).toBe(true);
  expect(gate.current.buffer).toEqual([]);
});

test("apply が拒否されたら release で failed に倒す", () => {
  const gate = { current: WatcherGate.init(session()) };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);
  lifecycle.start();

  const applied = lifecycle.apply(session({ projectKey: "/home/user/other" }));
  lifecycle.release();

  expect(applied).toBeNull();
  expect(gate.current.resyncPending).toBe(true);
});

test("世代が変わっていれば release は gate に触らない", () => {
  const gate = { current: WatcherGate.init(session()) };
  const lifecycle = ResyncGateLifecycle.forRequest(gate, GENERATION);
  lifecycle.start();
  gate.current = WatcherGate.init(session({ generation: GENERATION + 1 }));
  const afterReopen = gate.current;

  lifecycle.release();

  expect(gate.current).toBe(afterReopen);
  expect(gate.current.resyncPending).toBe(false);
});
