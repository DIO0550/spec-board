import { expect, test } from "vitest";
import { Option } from "@/utils/option";

test("Option.some は { some: true, value } を生成する", () => {
  expect(Option.some(42)).toEqual({ some: true, value: 42 });
});

test("Option.none は { some: false } を生成する", () => {
  expect(Option.none()).toEqual({ some: false });
});

test("Option.isSome は Some のとき true を返す", () => {
  const o: Option<number> = Option.some(2);
  expect(Option.isSome(o)).toBe(true);
});

test("Option.isSome は None のとき false を返す", () => {
  const o: Option<number> = Option.none();
  expect(Option.isSome(o)).toBe(false);
});

test("Option.isNone は None のとき true を返す", () => {
  const o: Option<number> = Option.none();
  expect(Option.isNone(o)).toBe(true);
});

test("Option.isNone は Some のとき false を返す", () => {
  const o: Option<number> = Option.some(2);
  expect(Option.isNone(o)).toBe(false);
});

test("Option.map は Some のみ value を変換する", () => {
  const o: Option<number> = Option.some(2);
  expect(Option.map(o, (x) => x * 3)).toEqual({ some: true, value: 6 });
});

test("Option.map は None はそのまま返す", () => {
  const o: Option<number> = Option.none();
  expect(Option.map<number, number>(o, (x) => x * 3)).toEqual({ some: false });
});

test("Option.unwrapOr は Some なら value を返す", () => {
  expect(Option.unwrapOr(Option.some(2) as Option<number>, 0)).toBe(2);
});

test("Option.unwrapOr は None なら defaultValue を返す", () => {
  expect(Option.unwrapOr(Option.none() as Option<number>, 0)).toBe(0);
});

test.for([
  ["null", null],
  ["undefined", undefined],
] as const)("Option.fromNullable は %s を None にする", ([, v]) => {
  expect(Option.fromNullable(v)).toEqual({ some: false });
});

test("Option.fromNullable は 0 を Some(0) にする", () => {
  expect(Option.fromNullable(0)).toEqual({ some: true, value: 0 });
});

test("Option.fromNullable は 空文字 を Some('') にする", () => {
  expect(Option.fromNullable("")).toEqual({ some: true, value: "" });
});

test("Option.match は Some のとき some ハンドラを呼ぶ", () => {
  const o: Option<number> = Option.some(2);
  expect(
    Option.match(o, {
      some: (v) => `v=${v}`,
      none: () => "n",
    }),
  ).toBe("v=2");
});

test("Option.match は None のとき none ハンドラを呼ぶ", () => {
  const o: Option<number> = Option.none();
  expect(
    Option.match(o, {
      some: (v) => `v=${v}`,
      none: () => "n",
    }),
  ).toBe("n");
});
