import { afterEach, expect, test, vi } from "vitest";
import { LabelInput, type LabelInputState } from "..";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("startAdding: idle → { kind: 'adding', input: '' }", () => {
  expect(LabelInput.startAdding({ kind: "idle" })).toEqual({
    kind: "adding",
    input: "",
  });
});

test("setInput: adding → input 更新", () => {
  const s: LabelInputState = { kind: "adding", input: "x" };
  expect(LabelInput.setInput(s, { value: "foo" })).toEqual({
    kind: "adding",
    input: "foo",
  });
});

test("setInput: 同値なら state そのまま（参照同一）", () => {
  const s: LabelInputState = { kind: "adding", input: "foo" };
  const result = LabelInput.setInput(s, { value: "foo" });
  expect(Object.is(result, s)).toBe(true);
});

test("setInput: 異なる値なら新オブジェクト", () => {
  const s: LabelInputState = { kind: "adding", input: "foo" };
  const result = LabelInput.setInput(s, { value: "bar" });
  expect(Object.is(result, s)).toBe(false);
  expect(result).toEqual({ kind: "adding", input: "bar" });
});

test("cancel: adding → idle", () => {
  expect(LabelInput.cancel({ kind: "adding", input: "x" })).toEqual({
    kind: "idle",
  });
});

test("confirm: adding → idle", () => {
  expect(LabelInput.confirm({ kind: "adding", input: "x" })).toEqual({
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
  const initial: LabelInputState =
    from === "idle" ? { kind: "idle" } : { kind: "adding", input: "x" };
  const result =
    event === "startAdding"
      ? LabelInput.startAdding(initial)
      : event === "setInput"
        ? LabelInput.setInput(initial, { value: "y" })
        : event === "cancel"
          ? LabelInput.cancel(initial)
          : LabelInput.confirm(initial);
  expect(result.kind).toBe(expected);
});

test("不正遷移: idle で setInput → state そのまま + dev で console.warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = LabelInput.setInput({ kind: "idle" }, { value: "x" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledWith(
    "Invalid LabelInput transition: setInput from idle",
  );
});

test("不正遷移: idle で cancel → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = LabelInput.cancel({ kind: "idle" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: idle で confirm → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const result = LabelInput.confirm({ kind: "idle" });
  expect(result).toEqual({ kind: "idle" });
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("不正遷移: adding で startAdding → state そのまま + warn", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const before: LabelInputState = { kind: "adding", input: "x" };
  const result = LabelInput.startAdding(before);
  expect(result).toBe(before);
  expect(warnSpy).toHaveBeenCalledTimes(1);
});

test("prod 環境では不正遷移時に console.warn が呼ばれない", () => {
  vi.stubEnv("DEV", false);
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  LabelInput.setInput({ kind: "idle" }, { value: "x" });
  expect(warnSpy).not.toHaveBeenCalled();
});

const IS_ADDING_CASES = [
  [{ kind: "idle" } as LabelInputState, false],
  [{ kind: "adding", input: "" } as LabelInputState, true],
  [{ kind: "adding", input: "foo" } as LabelInputState, true],
] as const;

test.each(IS_ADDING_CASES)("isAdding: %j → %s", (state, expected) => {
  expect(LabelInput.isAdding(state)).toBe(expected);
});

const INPUT_OF_CASES = [
  [{ kind: "idle" } as LabelInputState, undefined],
  [{ kind: "adding", input: "" } as LabelInputState, ""],
  [{ kind: "adding", input: "foo" } as LabelInputState, "foo"],
] as const;

test.each(INPUT_OF_CASES)("inputOf: %j → %s", (state, expected) => {
  expect(LabelInput.inputOf(state)).toBe(expected);
});
