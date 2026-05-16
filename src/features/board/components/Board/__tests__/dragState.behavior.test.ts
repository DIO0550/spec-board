import { expect, test } from "vitest";
import {
  DRAG_MIME_TYPE,
  DragAction,
  type DragState,
  dragReducer,
} from "../dragState";

const draggingState: DragState = {
  draggingTaskFilePath: "tasks/a.md",
  draggingFromColumn: "Todo",
  hoverColumn: null,
  hoverIndex: null,
};

test("DragAction.start は DragActionStart 型の object を返す", () => {
  const action = DragAction.start("tasks/a.md", "Todo");
  expect(action).toEqual({
    type: "start",
    taskFilePath: "tasks/a.md",
    fromColumn: "Todo",
  });
});

test("DragAction.hover は column / index を持つ DragActionHover を返す", () => {
  const action = DragAction.hover("In Progress", 2);
  expect(action).toEqual({ type: "hover", column: "In Progress", index: 2 });
});

test("DragAction.hover は null 引数も保持する", () => {
  const action = DragAction.hover(null, null);
  expect(action).toEqual({ type: "hover", column: null, index: null });
});

test("DragAction.end は DragActionEnd を返す", () => {
  const action = DragAction.end();
  expect(action).toEqual({ type: "end" });
});

test("初期 state は null", () => {
  const state = dragReducer(null, DragAction.end());
  expect(state).toBeNull();
});

test("start で DRAGGING 状態へ遷移し hoverColumn / hoverIndex は null", () => {
  const next = dragReducer(null, DragAction.start("tasks/a.md", "Todo"));
  expect(next).toEqual({
    draggingTaskFilePath: "tasks/a.md",
    draggingFromColumn: "Todo",
    hoverColumn: null,
    hoverIndex: null,
  });
});

test("hover で hoverColumn と hoverIndex が設定される", () => {
  const next = dragReducer(draggingState, DragAction.hover("Done", 1));
  expect(next).toEqual({
    ...draggingState,
    hoverColumn: "Done",
    hoverIndex: 1,
  });
});

test("hover 同値時は同じ参照を返す（再 render 抑止）", () => {
  const stateWithHover: DragState = {
    ...draggingState,
    hoverColumn: "Done",
    hoverIndex: 1,
  };
  const next = dragReducer(stateWithHover, DragAction.hover("Done", 1));
  expect(next).toBe(stateWithHover);
});

test("state が null の時 hover を呼んでも null のまま（参照同一）", () => {
  const next = dragReducer(null, DragAction.hover("Todo", 0));
  expect(next).toBeNull();
});

test("end で null に戻る", () => {
  const next = dragReducer(draggingState, DragAction.end());
  expect(next).toBeNull();
});

test("DRAG_MIME_TYPE は固定の application/x-spec-board-task", () => {
  expect(DRAG_MIME_TYPE).toBe("application/x-spec-board-task");
});
