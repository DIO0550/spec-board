import { expect, test } from "vitest";
import { resolveCloseTarget } from "../resolveCloseTarget";

test("board 起点は board へ戻り selectedTaskId は null", () => {
  expect(resolveCloseTarget("board", null)).toEqual({
    view: "board",
    selectedTaskId: null,
  });
});

test("detail 起点 + taskId ありは detail へ復帰し selectedTaskId を復元する", () => {
  expect(resolveCloseTarget("detail", "tasks/t1.md")).toEqual({
    view: "detail",
    selectedTaskId: "tasks/t1.md",
  });
});

test("detail 起点でも taskId が null なら detail 復帰せず素直に遷移する", () => {
  expect(resolveCloseTarget("detail", null)).toEqual({
    view: "detail",
    selectedTaskId: null,
  });
});
