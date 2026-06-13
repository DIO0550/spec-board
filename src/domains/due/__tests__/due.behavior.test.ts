import { afterEach, expect, test, vi } from "vitest";
import { Due } from "..";

const TODAY = "2026-06-01";

test.each([
  { due: "2026-06-01", expected: "今日" },
  { due: "2026-06-10", expected: "あと 9 日" },
  { due: "2026-06-02", expected: "あと 1 日" },
  { due: "2026-05-30", expected: "2 日超過（期限切れ）" },
  { due: "2026-05-31", expected: "1 日超過（期限切れ）" },
])("format($due, $TODAY) は $expected", ({ due, expected }) => {
  expect(Due.format(due, TODAY)).toBe(expected);
});

test("format は月をまたぐ未来日も日数で表す", () => {
  expect(Due.format("2026-07-01", "2026-06-30")).toBe("あと 1 日");
});

test.each([
  { due: "2026/6/30" },
  { due: "tomorrow" },
  { due: "2026-02-29" },
  { due: "" },
])("不正な due $due の format は undefined", ({ due }) => {
  expect(Due.format(due, TODAY)).toBeUndefined();
});

test("未設定 due の format は undefined", () => {
  expect(Due.format(undefined, TODAY)).toBeUndefined();
});

test.each([
  { raw: "", label: "空文字" },
  { raw: undefined, label: "未設定" },
  { raw: "2026-02-29", label: "非うるう年2月29日" },
  { raw: "2026/6/30", label: "区切り違い" },
  { raw: "2026-13-01", label: "範囲外月" },
])("parse は不正値 $label を undefined にする", ({ raw }) => {
  expect(Due.parse(raw)).toBeUndefined();
});

test.each([
  { raw: "2026-06-30" },
  { raw: "2024-02-29" },
  { raw: "0001-01-01" },
  { raw: "0099-12-31" },
  { raw: "0100-01-01" },
])("parse は妥当な日付 $raw を原文のまま返す", ({ raw }) => {
  expect(Due.parse(raw)).toBe(raw);
});

test.each([
  { due: "2026-05-30", expected: true, label: "過去" },
  { due: "2026-06-01", expected: false, label: "今日" },
  { due: "2026-06-10", expected: false, label: "未来" },
  { due: "2026/6/30", expected: false, label: "不正値" },
])("isOverdue $label は $expected", ({ due, expected }) => {
  expect(Due.isOverdue(due, TODAY)).toBe(expected);
});

afterEach(() => {
  vi.useRealTimers();
});

test.each([
  { now: new Date(2026, 5, 1, 9, 30), expected: "2026-06-01" },
  { now: new Date(2026, 0, 5, 0, 0), expected: "2026-01-05" },
  { now: new Date(2026, 11, 31, 23, 59), expected: "2026-12-31" },
])("todayLocal はローカル日付を $expected で返す", ({ now, expected }) => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  expect(Due.todayLocal()).toBe(expected);
});
