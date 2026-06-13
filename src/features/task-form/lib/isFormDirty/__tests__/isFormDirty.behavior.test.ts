import { expect, test } from "vitest";
import { type FormDirtyInput, isFormDirty } from "..";

const initialInput = (
  overrides: Partial<FormDirtyInput> = {},
): FormDirtyInput => ({
  values: {
    title: "",
    fileName: "",
    status: "Todo",
    due: "",
    priority: "",
    body: "",
    subIssues: "",
    draft: false,
    parent: undefined,
    ...overrides.values,
  },
  labels: [],
  labelInput: "",
  links: [],
  initialStatus: "Todo",
  initialParent: undefined,
  ...overrides,
});

test("完全な初期状態では false を返す（即閉じてよい）", () => {
  expect(isFormDirty(initialInput())).toBe(false);
});

test("title を入力すると true を返す", () => {
  const input = initialInput();
  input.values.title = "T";
  expect(isFormDirty(input)).toBe(true);
});

test("status を初期値から変更すると true を返す", () => {
  const input = initialInput();
  input.values.status = "Doing";
  expect(isFormDirty(input)).toBe(true);
});

test("status が initialStatus と同値なら false のまま", () => {
  const input = initialInput({ initialStatus: "Doing" });
  input.values.status = "Doing";
  expect(isFormDirty(input)).toBe(false);
});

test.each([
  ["fileName", { fileName: "custom" }],
  ["due", { due: "2026-07-01" }],
  ["priority", { priority: "High" }],
  ["body", { body: "本文" }],
  ["subIssues", { subIssues: "子タスク" }],
] as const)("%s のみ入力しても true を返す", (_field, override) => {
  const input = initialInput();
  Object.assign(input.values, override);
  expect(isFormDirty(input)).toBe(true);
});

test("draft を true に変更すると true を返す", () => {
  const input = initialInput();
  input.values.draft = true;
  expect(isFormDirty(input)).toBe(true);
});

test("labelInput に未確定文字があると true を返す", () => {
  expect(isFormDirty(initialInput({ labelInput: "bu" }))).toBe(true);
});

test("labels が確定済みだと true を返す", () => {
  expect(isFormDirty(initialInput({ labels: ["bug"] }))).toBe(true);
});

test("links が選択済みだと true を返す", () => {
  expect(isFormDirty(initialInput({ links: ["tasks/a.md"] }))).toBe(true);
});

test("initialParent 指定時に parent が同値なら false を返す（自動セットは dirty にしない）", () => {
  const input = initialInput({ initialParent: "tasks/parent.md" });
  input.values.parent = "tasks/parent.md";
  expect(isFormDirty(input)).toBe(false);
});

test("parent を初期値から変更すると true を返す", () => {
  const input = initialInput({ initialParent: "tasks/parent.md" });
  input.values.parent = "tasks/other.md";
  expect(isFormDirty(input)).toBe(true);
});

test("initialParent 未指定で parent が空文字でも false のまま（未指定と空は同一視）", () => {
  const input = initialInput();
  input.values.parent = "";
  expect(isFormDirty(input)).toBe(false);
});
