import { expect, test } from "vitest";
import type { WatcherDiagnosticCode } from "@/domains/watcher-diagnostic";
import { watcherDiagnosticMessage } from "../index";

const CODES: readonly WatcherDiagnosticCode[] = [
  "watchPathUnavailable",
  "resourceExhausted",
  "permissionDenied",
  "io",
  "unknown",
  "rescanFailed",
];

test.each(CODES)("%s の文言が空文字にならない", (code) => {
  expect(watcherDiagnosticMessage(code).length).toBeGreaterThan(0);
});

test("code ごとに異なる文言を返す", () => {
  const messages = CODES.map(watcherDiagnosticMessage);

  expect(new Set(messages).size).toBe(CODES.length);
});

test.each([
  ["監視上限", "resourceExhausted" as const, "監視上限"],
  ["フォルダ喪失", "watchPathUnavailable" as const, "アクセスできなく"],
  ["権限不足", "permissionDenied" as const, "権限"],
  ["再読み込み失敗", "rescanFailed" as const, "再読み込み"],
])("%s は状況が伝わる語を含む", (_label, code, expected) => {
  expect(watcherDiagnosticMessage(code)).toContain(expected);
});

test("未知の code でも例外を投げず汎用文言を返す", () => {
  const unknownCode = "brandNew" as WatcherDiagnosticCode;

  expect(() => watcherDiagnosticMessage(unknownCode)).not.toThrow();
  expect(watcherDiagnosticMessage(unknownCode)).toBe(
    watcherDiagnosticMessage("unknown"),
  );
});
