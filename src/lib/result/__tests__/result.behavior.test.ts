import { expect, test } from "vitest";
import { Result } from "@/lib/result";

test("Result.ok は { ok: true, value } を生成する", () => {
  expect(Result.ok(42)).toEqual({ ok: true, value: 42 });
});

test("Result.err は { ok: false, error } を生成する", () => {
  expect(Result.err("e")).toEqual({ ok: false, error: "e" });
});

test("Result.isOk は Ok のとき true を返す", () => {
  const r: Result<number, string> = Result.ok(2);
  expect(Result.isOk(r)).toBe(true);
});

test("Result.isOk は Err のとき false を返す", () => {
  const r: Result<number, string> = Result.err("e");
  expect(Result.isOk(r)).toBe(false);
});

test("Result.isErr は Err のとき true を返す", () => {
  const r: Result<number, string> = Result.err("oops");
  expect(Result.isErr(r)).toBe(true);
});

test("Result.isErr は Ok のとき false を返す", () => {
  const r: Result<number, string> = Result.ok(2);
  expect(Result.isErr(r)).toBe(false);
});

test("Result.map は Ok のみ value を変換する", () => {
  const r: Result<number, string> = Result.ok(2);
  expect(Result.map(r, (x) => x * 3)).toEqual({ ok: true, value: 6 });
});

test("Result.map は Err はそのまま返す", () => {
  const r: Result<number, string> = Result.err("e");
  expect(Result.map<number, number, string>(r, (x) => x * 3)).toEqual({
    ok: false,
    error: "e",
  });
});

test("Result.mapErr は Err のみ error を変換する", () => {
  const r: Result<number, string> = Result.err("e");
  expect(Result.mapErr<number, string, number>(r, (s) => s.length)).toEqual({
    ok: false,
    error: 1,
  });
});

test("Result.mapErr は Ok はそのまま返す", () => {
  const r: Result<number, string> = Result.ok(2);
  expect(Result.mapErr<number, string, number>(r, (s) => s.length)).toEqual({
    ok: true,
    value: 2,
  });
});

test("Result.unwrapOr は Ok なら value を返す", () => {
  expect(Result.unwrapOr(Result.ok(2) as Result<number, string>, 0)).toBe(2);
});

test("Result.unwrapOr は Err なら defaultValue を返す", () => {
  expect(Result.unwrapOr(Result.err("e") as Result<number, string>, 0)).toBe(0);
});

test("Result.match は Ok のとき ok ハンドラを呼ぶ", () => {
  const okRes: Result<number, string> = Result.ok(2);
  expect(
    Result.match(okRes, {
      ok: (v) => `v=${v}`,
      err: (e) => `e=${e}`,
    }),
  ).toBe("v=2");
});

test("Result.match は Err のとき err ハンドラを呼ぶ", () => {
  const errRes: Result<number, string> = Result.err("e");
  expect(
    Result.match(errRes, {
      ok: (v) => `v=${v}`,
      err: (e) => `e=${e}`,
    }),
  ).toBe("e=e");
});
