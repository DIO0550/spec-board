import { expect, test } from "vitest";
import {
  WatcherDiagnostic,
  type WatcherDiagnosticCode,
} from "@/domains/watcher-diagnostic";

const KNOWN_CODES: readonly WatcherDiagnosticCode[] = [
  "watchPathUnavailable",
  "resourceExhausted",
  "permissionDenied",
  "io",
  "unknown",
  "rescanFailed",
];

test.each(KNOWN_CODES)("normalizeCode は既知の %s をそのまま返す", (code) => {
  expect(WatcherDiagnostic.normalizeCode(code)).toBe(code);
});

test.each([
  ["BE が新設した未知コード", "somethingNew"],
  ["空文字", ""],
  ["大文字始まり", "ResourceExhausted"],
])("normalizeCode は %s を unknown に丸める", (_label, raw) => {
  expect(WatcherDiagnostic.normalizeCode(raw)).toBe("unknown");
});
