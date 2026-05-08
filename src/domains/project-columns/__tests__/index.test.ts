import { expect, test } from "vitest";
import type { Column } from "@/types/column";
import { ProjectColumns, type ProjectColumnsChange } from "..";

const columns = (...names: string[]): Column[] =>
  names.map((name, order) => ({ name, order }));

test("isDoneColumnSensitive は rename があれば true を返す", () => {
  const change: ProjectColumnsChange = {
    columns: columns("Todo", "完了"),
    renames: [{ from: "Done", to: "完了" }],
  };

  const result = ProjectColumns.isDoneColumnSensitive(
    columns("Todo", "Done"),
    change,
  );

  expect(result).toBe(true);
});

test("isDoneColumnSensitive は既存 column が削除されるなら true を返す", () => {
  const change: ProjectColumnsChange = {
    columns: columns("Todo"),
  };

  const result = ProjectColumns.isDoneColumnSensitive(
    columns("Todo", "Done"),
    change,
  );

  expect(result).toBe(true);
});

test("isDoneColumnSensitive は rename も削除もなければ false を返す", () => {
  const change: ProjectColumnsChange = {
    columns: columns("Todo", "Done", "Backlog"),
  };

  const result = ProjectColumns.isDoneColumnSensitive(
    columns("Todo", "Done"),
    change,
  );

  expect(result).toBe(false);
});

test("validateDoneColumn は doneColumn 削除時に domain error を返す", () => {
  const result = ProjectColumns.validateDoneColumn("Done", {
    columns: columns("Todo"),
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: "doneColumnRemoved",
      message: "doneColumn を削除する操作は新しい doneColumn の指定が必要です",
    },
  });
});

test("validateDoneColumn は指定 doneColumn が columns に存在しなければ domain error を返す", () => {
  const result = ProjectColumns.validateDoneColumn("Done", {
    columns: columns("Todo"),
    doneColumn: "Done",
  });

  expect(result).toEqual({
    ok: false,
    error: {
      code: "doneColumnNotInColumns",
      message: 'doneColumn "Done" は columns に存在しません',
    },
  });
});

test("validateDoneColumn は doneColumn が columns に存在すれば ok を返す", () => {
  const result = ProjectColumns.validateDoneColumn("Done", {
    columns: columns("Todo", "Done"),
  });

  expect(result.ok).toBe(true);
});
