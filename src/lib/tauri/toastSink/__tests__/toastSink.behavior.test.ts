import { afterEach, expect, test, vi } from "vitest";
import {
  getToastSink,
  registerToastSink,
  unregisterToastSink,
} from "@/lib/tauri/toastSink";

// モジュールスコープ sink のグローバル state が後続テストへリークしないよう、
// 各テスト後に必ず解除する。
afterEach(unregisterToastSink);

test("未登録時は getToastSink() が null を返す", () => {
  expect(getToastSink()).toBeNull();
});

test("registerToastSink(fn) 後に getToastSink() が登録した fn を返す", () => {
  const fn = vi.fn();
  registerToastSink(fn);
  expect(getToastSink()).toBe(fn);
});

test("unregisterToastSink() 後は getToastSink() が null に戻る", () => {
  registerToastSink(vi.fn());
  unregisterToastSink();
  expect(getToastSink()).toBeNull();
});

test("再登録すると後から登録した sink で上書きされる", () => {
  const a = vi.fn();
  const b = vi.fn();
  registerToastSink(a);
  registerToastSink(b);
  expect(getToastSink()).toBe(b);
});

test("register の戻り cleanup は自分が登録した sink のときだけ解除する", () => {
  const a = vi.fn();
  const b = vi.fn();
  const cleanupA = registerToastSink(a);
  registerToastSink(b);
  // a の cleanup を呼んでも、現役は b なので b は消えない。
  cleanupA();
  expect(getToastSink()).toBe(b);
});

test("register の戻り cleanup は自分が現役なら sink を null に戻す", () => {
  const a = vi.fn();
  const cleanupA = registerToastSink(a);
  cleanupA();
  expect(getToastSink()).toBeNull();
});
