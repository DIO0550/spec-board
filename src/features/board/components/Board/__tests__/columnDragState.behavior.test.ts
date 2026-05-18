import { expect, test } from "vitest";
import {
  COLUMN_DRAG_MIME_TYPE,
  ColumnDragState,
  type ColumnDragState as ColumnDragStateT,
} from "../columnDragState";

test("COLUMN_DRAG_MIME_TYPE は 'application/x-spec-board-column'", () => {
  expect(COLUMN_DRAG_MIME_TYPE).toBe("application/x-spec-board-column");
});

test("initial は {kind: 'idle'}", () => {
  expect(ColumnDragState.initial).toEqual({ kind: "idle" });
});

test("idle + start → dragging (fromColumnName + hoverColumnName=null)", () => {
  const next = ColumnDragState.reducer(ColumnDragState.initial, {
    type: "start",
    fromColumnName: "A",
  });
  expect(next).toEqual({
    kind: "dragging",
    fromColumnName: "A",
    hoverColumnName: null,
  });
});

test("dragging + hover → hoverColumnName が更新される", () => {
  const dragging: ColumnDragStateT = {
    kind: "dragging",
    fromColumnName: "A",
    hoverColumnName: null,
  };
  const next = ColumnDragState.reducer(dragging, {
    type: "hover",
    hoverColumnName: "C",
  });
  expect(next).toEqual({
    kind: "dragging",
    fromColumnName: "A",
    hoverColumnName: "C",
  });
});

test("dragging + end → idle", () => {
  const dragging: ColumnDragStateT = {
    kind: "dragging",
    fromColumnName: "A",
    hoverColumnName: "C",
  };
  expect(ColumnDragState.reducer(dragging, { type: "end" })).toEqual({
    kind: "idle",
  });
});

test("idle + hover は idle のまま（不正遷移は無視）", () => {
  const next = ColumnDragState.reducer(ColumnDragState.initial, {
    type: "hover",
    hoverColumnName: "C",
  });
  expect(next).toBe(ColumnDragState.initial);
});
