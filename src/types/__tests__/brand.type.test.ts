import { expectTypeOf, test } from "vitest";
import type { Brand } from "../brand";

type FooId = Brand<string, "FooId">;
type BarId = Brand<string, "BarId">;

test("Brand 型は元のプリミティブ型 string に代入できる（widening）", () => {
  const foo = "abc" as FooId;
  const plain: string = foo;
  expectTypeOf(plain).toEqualTypeOf<string>();
});

test("同じ Name の Brand 同士は代入できる", () => {
  const foo1 = "abc" as FooId;
  const foo2: FooId = foo1;
  expectTypeOf(foo2).toEqualTypeOf<FooId>();
});

test("プリミティブ string は Brand 型に直接代入できない（narrowing は cast 必須）", () => {
  const plain: string = "abc";
  // @ts-expect-error string は FooId へ直接代入できない
  const foo: FooId = plain;
  expectTypeOf(foo).toEqualTypeOf<FooId>();
});

test('Brand<string, "A"> は Brand<string, "B"> に代入できない（順方向）', () => {
  const foo = "abc" as FooId;
  // @ts-expect-error FooId と BarId は Name が異なるため非互換
  const bar: BarId = foo;
  expectTypeOf(bar).toEqualTypeOf<BarId>();
});

test('Brand<string, "B"> は Brand<string, "A"> に代入できない（逆方向）', () => {
  const bar = "xyz" as BarId;
  // @ts-expect-error BarId と FooId は Name が異なるため非互換
  const foo: FooId = bar;
  expectTypeOf(foo).toEqualTypeOf<FooId>();
});

type Inner = Brand<string, "Inner">;
type Outer = Brand<Inner, "Outer">;
type Unrelated = Brand<string, "Unrelated">;

test("スタック値は第 1 Brand に代入できる（widening）", () => {
  const stacked = "abc" as Outer;
  const inner: Inner = stacked;
  expectTypeOf(inner).toEqualTypeOf<Inner>();
});

test("スタック値は第 2 Brand 単独としても扱える", () => {
  const stacked = "abc" as Outer;
  type OuterAlone = Brand<string, "Outer">;
  const outerAlone: OuterAlone = stacked;
  expectTypeOf(outerAlone).toEqualTypeOf<OuterAlone>();
});

test("スタック値は元の string に代入できる（二段 widening）", () => {
  const stacked = "abc" as Outer;
  const plain: string = stacked;
  expectTypeOf(plain).toEqualTypeOf<string>();
});

test("スタック値は無関係な Brand には代入できない（Mapped Type による nominal safety）", () => {
  const stacked = "abc" as Outer;
  // @ts-expect-error Outer は Unrelated の Name キー "Unrelated" を持たない
  const unrelated: Unrelated = stacked;
  expectTypeOf(unrelated).toEqualTypeOf<Unrelated>();
});

test("第 1 Brand 単独はスタック型に直接代入できない（narrowing）", () => {
  const inner = "abc" as Inner;
  // @ts-expect-error Inner は Outer の Name キー "Outer" を持たない
  const stacked: Outer = inner;
  expectTypeOf(stacked).toEqualTypeOf<Outer>();
});

test("string はスタック型に直接代入できない（narrowing）", () => {
  const plain: string = "abc";
  // @ts-expect-error string はスタック型の Brand キーをいずれも持たない
  const stacked: Outer = plain;
  expectTypeOf(stacked).toEqualTypeOf<Outer>();
});

type Year = Brand<number, "Year">;

test('Brand<number, "Year"> で number ベースの nominal 型が作れて number に widening できる', () => {
  const year = 2026 as Year;
  const num: number = year;
  expectTypeOf(num).toEqualTypeOf<number>();
});

type Tags = Brand<readonly string[], "Tags">;

test('Brand<readonly string[], "Tags"> で配列ベースの nominal 型が作れて配列に widening できる', () => {
  const tags = ["a", "b"] as unknown as Tags;
  const arr: readonly string[] = tags;
  expectTypeOf(arr).toEqualTypeOf<readonly string[]>();
});

type ConfigBrand = Brand<{ a: 1 }, "Config">;

test('Brand<{ a: 1 }, "Config"> でオブジェクトベースの nominal 型が作れてオブジェクトに widening できる', () => {
  const cfg = { a: 1 } as ConfigBrand;
  const obj: { a: 1 } = cfg;
  expectTypeOf(obj).toEqualTypeOf<{ a: 1 }>();
});
