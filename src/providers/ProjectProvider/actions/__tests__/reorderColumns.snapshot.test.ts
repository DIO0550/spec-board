import { expect, test } from "vitest";
import type { ProjectData } from "@/domains/project-data";
import type { Column } from "@/types/column";
import { ReorderSnapshot } from "../reorderColumns";

const dataOf = (columns: readonly Column[]): ProjectData => ({
  tasks: [],
  columns: [...columns],
  projections: new Map(),
  openRequestId: 0,
});

const cols = (...names: readonly string[]): readonly Column[] =>
  names.map((name, order) => ({ name, order }));

test("from: 標準ケース A,B,C → from='A', to='C' で afterColumns / index / columnName が解決される", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  expect(snapshot.beforeColumns.map((c) => c.name)).toEqual(["A", "B", "C"]);
  expect(snapshot.afterColumns.map((c) => c.name)).toEqual(["B", "C", "A"]);
  expect(snapshot.afterColumns.map((c) => c.order)).toEqual([0, 1, 2]);
  expect(snapshot.columnName).toBe("A");
  expect(snapshot.fromIndex).toBe(0);
  expect(snapshot.toIndex).toBe(2);
  expect(snapshot.isNoop).toBe(false);
});

test("from: 同名 (from === to) は isNoop=true で afterColumns === beforeColumns（参照同一）", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "B", "B");
  expect(snapshot.isNoop).toBe(true);
  expect(snapshot.afterColumns).toBe(snapshot.beforeColumns);
});

test("from: columns.length < 2 は isNoop=true", () => {
  const data = dataOf(cols("A"));
  const snapshot = ReorderSnapshot.from(data, "A", "A");
  expect(snapshot.isNoop).toBe(true);
});

test("from: data.columns が逆順でも表示順 [A,B,C] に sort してから解決される", () => {
  const data: ProjectData = {
    tasks: [],
    columns: [
      { name: "C", order: 2 },
      { name: "B", order: 1 },
      { name: "A", order: 0 },
    ],
    projections: new Map(),
    openRequestId: 0,
  };
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  expect(snapshot.afterColumns.map((c) => c.name)).toEqual(["B", "C", "A"]);
  expect(snapshot.afterColumns.map((c) => c.order)).toEqual([0, 1, 2]);
  expect(snapshot.fromIndex).toBe(0);
  expect(snapshot.toIndex).toBe(2);
});

test("from: order に gap がある [A(0), B(5), C(10)] でも from='A', to='C' で 0-origin 連番に正規化", () => {
  const data: ProjectData = {
    tasks: [],
    columns: [
      { name: "A", order: 0 },
      { name: "B", order: 5 },
      { name: "C", order: 10 },
    ],
    projections: new Map(),
    openRequestId: 0,
  };
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  expect(snapshot.afterColumns).toEqual([
    { name: "B", order: 0 },
    { name: "C", order: 1 },
    { name: "A", order: 2 },
  ]);
});

test("from: fromColumnName が存在しないと isNoop=true で afterColumns === beforeColumns", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "Z", "C");
  expect(snapshot.isNoop).toBe(true);
  expect(snapshot.afterColumns).toBe(snapshot.beforeColumns);
});

test("from: toColumnName が存在しないと isNoop=true", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "Z");
  expect(snapshot.isNoop).toBe(true);
  expect(snapshot.afterColumns).toBe(snapshot.beforeColumns);
});

test("optimisticDispatch: afterColumns(copy) を columns-replaced で返す", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  const action = ReorderSnapshot.optimisticDispatch(snapshot);
  expect(action).toEqual({
    type: "columns-replaced",
    columns: snapshot.afterColumns,
    renames: [],
    doneColumn: undefined,
  });
});

test("optimisticDispatch: 返却 columns は afterColumns と参照が異なる（コピー）", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  const action = ReorderSnapshot.optimisticDispatch(snapshot) as {
    type: "columns-replaced";
    columns: readonly Column[];
  };
  expect(action.columns).not.toBe(snapshot.afterColumns);
});

test("rollbackDispatch: beforeColumns(copy) を columns-replaced で返す", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  const action = ReorderSnapshot.rollbackDispatch(snapshot);
  expect(action).toEqual({
    type: "columns-replaced",
    columns: snapshot.beforeColumns,
    renames: [],
    doneColumn: undefined,
  });
});

test("rollbackDispatch: 返却 columns は beforeColumns と参照が異なる（コピー）", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  const action = ReorderSnapshot.rollbackDispatch(snapshot) as {
    type: "columns-replaced";
    columns: readonly Column[];
  };
  expect(action.columns).not.toBe(snapshot.beforeColumns);
});

test("toCommandBuilder: current 引数を見ず snapshot.afterColumns を返す", () => {
  const data = dataOf(cols("A", "B", "C"));
  const snapshot = ReorderSnapshot.from(data, "A", "C");
  const builder = ReorderSnapshot.toCommandBuilder(snapshot);
  const unrelatedCurrent: ProjectData = {
    tasks: [],
    columns: [
      { name: "X", order: 0 },
      { name: "Y", order: 1 },
    ],
    projections: new Map(),
    openRequestId: 0,
  };
  expect(builder(unrelatedCurrent)).toEqual({
    columns: snapshot.afterColumns,
    renames: [],
    doneColumn: undefined,
  });
});
