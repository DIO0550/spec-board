import { afterEach, expect, test, vi } from "vitest";
import { LabelsInput, type LabelsInputState } from "../machine";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("startAdding: idle → { kind: 'adding', input: '' }", () => {
  expect(LabelsInput.startAdding({ kind: "idle" })).toEqual({
    kind: "adding",
    input: "",
  });
});

test("setInput: adding → input 更新", () => {
  const s: LabelsInputState = { kind: "adding", input: "x" };
  expect(LabelsInput.setInput(s, { value: "foo" })).toEqual({
    kind: "adding",
    input: "foo",
  });
});

test("setInput: 同値なら state そのまま（参照同一）", () => {
  const s: LabelsInputState = { kind: "adding", input: "foo" };
  const result = LabelsInput.setInput(s, { value: "foo" });
  expect(Object.is(result, s)).toBe(true);
});

test("setInput: 異なる値なら新オブジェクト", () => {
  const s: LabelsInputState = { kind: "adding", input: "foo" };
  const result = LabelsInput.setInput(s, { value: "bar" });
  expect(Object.is(result, s)).toBe(false);
  expect(result).toEqual({ kind: "adding", input: "bar" });
});

test("cancel: adding → idle", () => {
  expect(LabelsInput.cancel({ kind: "adding", input: "x" })).toEqual({
    kind: "idle",
  });
});

test("confirm: adding → idle", () => {
  expect(LabelsInput.confirm({ kind: "adding", input: "x" })).toEqual({
    kind: "idle",
  });
});

const VALID_TRANSITIONS = [
  ["idle", "startAdding", "adding"],
  ["adding", "setInput", "adding"],
  ["adding", "cancel", "idle"],
  ["adding", "confirm", "idle"],
] as const;

test.each(
  VALID_TRANSITIONS,
)("matrix: %s + %s → %s", (from, event, expected) => {
  const initial: LabelsInputState =
    from === "idle" ? { kind: "idle" } : { kind: "adding", input: "x" };
  const result =
    event === "startAdding"
      ? LabelsInput.startAdding(initial)
      : event === "setInput"
        ? LabelsInput.setInput(initial, { value: "y" })
        : event === "cancel"
          ? LabelsInput.cancel(initial)
          : LabelsInput.confirm(initial);
  expect(result.kind).toBe(expected);
});

test("不正遷移: idle で setInput → state そのまま + dev で console.warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = LabelsInput.setInput({ kind: "idle" }, { value: "x" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledWith(
    "Invalid LabelsInput transition: setInput from idle",
  );
});

test("不正遷移: idle で cancel → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = LabelsInput.cancel({ kind: "idle" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: idle で confirm → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = LabelsInput.confirm({ kind: "idle" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: adding で startAdding → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const before: LabelsInputState = { kind: "adding", input: "x" };
  const result = LabelsInput.startAdding(before);
  expect(result).toBe(before);
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("prod 環境では不正遷移時に console.warn が呼ばれない", () => {
  vi.stubEnv("DEV", false);
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  LabelsInput.setInput({ kind: "idle" }, { value: "x" });
  expect(warnSpy).not.toHaveBeenCalled();
});
