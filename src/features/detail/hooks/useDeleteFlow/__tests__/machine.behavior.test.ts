import { afterEach, expect, test, vi } from "vitest";
import { DeleteFlow, type DeleteFlowState } from "../machine";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("request: idle → confirming", () => {
  expect(DeleteFlow.request({ kind: "idle" })).toEqual({ kind: "confirming" });
});

test("cancel: confirming → idle", () => {
  expect(DeleteFlow.cancel({ kind: "confirming" })).toEqual({ kind: "idle" });
});

test("confirm: confirming → deleting", () => {
  expect(DeleteFlow.confirm({ kind: "confirming" })).toEqual({
    kind: "deleting",
  });
});

test("succeed: deleting → idle", () => {
  expect(DeleteFlow.succeed({ kind: "deleting" })).toEqual({ kind: "idle" });
});

test("fail: deleting → error（payload は { reason } 形式）", () => {
  const reason = new Error("boom");
  expect(DeleteFlow.fail({ kind: "deleting" }, { reason })).toEqual({
    kind: "error",
    reason,
  });
});

test("cancel: error → idle", () => {
  const reason = new Error("x");
  expect(DeleteFlow.cancel({ kind: "error", reason })).toEqual({
    kind: "idle",
  });
});

test("confirm: error → deleting", () => {
  const reason = new Error("x");
  expect(DeleteFlow.confirm({ kind: "error", reason })).toEqual({
    kind: "deleting",
  });
});

const VALID_TRANSITIONS = [
  ["idle", "request", "confirming"],
  ["confirming", "cancel", "idle"],
  ["confirming", "confirm", "deleting"],
  ["deleting", "succeed", "idle"],
  ["deleting", "fail", "error"],
  ["error", "cancel", "idle"],
  ["error", "confirm", "deleting"],
] as const;

const initialFor = (kind: string): DeleteFlowState => {
  const map: Record<string, DeleteFlowState> = {
    idle: { kind: "idle" },
    confirming: { kind: "confirming" },
    deleting: { kind: "deleting" },
    error: { kind: "error", reason: "x" },
  };
  return map[kind];
};

const apply = (event: string, state: DeleteFlowState): DeleteFlowState => {
  const dispatch: Record<string, (s: DeleteFlowState) => DeleteFlowState> = {
    request: (s) => DeleteFlow.request(s),
    cancel: (s) => DeleteFlow.cancel(s),
    confirm: (s) => DeleteFlow.confirm(s),
    succeed: (s) => DeleteFlow.succeed(s),
    fail: (s) => DeleteFlow.fail(s, { reason: "x" }),
  };
  return dispatch[event](state);
};

test.each(
  VALID_TRANSITIONS,
)("matrix: %s + %s → %s", (from, event, expected) => {
  const result = apply(event, initialFor(from));
  expect(result.kind).toBe(expected);
});

test("不正遷移: succeed(idle) → state そのまま + dev で warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = DeleteFlow.succeed({ kind: "idle" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledWith(
    "Invalid DeleteFlow transition: succeed from idle",
  );
});

test("不正遷移: fail(idle) → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = DeleteFlow.fail({ kind: "idle" }, { reason: "x" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: request(deleting) → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = DeleteFlow.request({ kind: "deleting" });
  expect(result).toEqual({ kind: "deleting" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: cancel(deleting) → state そのまま（多重呼び出し no-op）", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = DeleteFlow.cancel({ kind: "deleting" });
  expect(result).toEqual({ kind: "deleting" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: confirm(deleting) → state そのまま（多重呼び出し no-op）", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = DeleteFlow.confirm({ kind: "deleting" });
  expect(result).toEqual({ kind: "deleting" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("prod 環境では不正遷移時に console.warn が呼ばれない", () => {
  vi.stubEnv("DEV", false);
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  DeleteFlow.succeed({ kind: "idle" });
  expect(warnSpy).not.toHaveBeenCalled();
});
