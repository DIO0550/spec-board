import { expect, test } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { selectTaskOutcome } from "..";

const makeTask = (overrides: Partial<TaskFromPayloadInput> = {}): Task =>
  Task.fromPayload({
    id: "t1",
    title: "タイトル",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/t1.md",
    ...overrides,
  });

test("target が tasks に見つかれば selectedTaskId と announceText を返す", () => {
  const task = makeTask({ id: "t1", title: "親", filePath: "tasks/t1.md" });
  const outcome = selectTaskOutcome([task], "t1");

  expect(outcome).toEqual({
    selectedTaskId: "t1",
    announceText: "「親」を表示中",
  });
});

test("target が tasks に無いとき null を返し setSelectedTaskId/announce の発火を防げる形", () => {
  const task = makeTask({ id: "t1" });
  const outcome = selectTaskOutcome([task], "missing");

  expect(outcome).toBeNull();
});

test("tasks が空でも null を返す（render と click の race で tasks が空に置換された場合）", () => {
  const outcome = selectTaskOutcome([], "t1");

  expect(outcome).toBeNull();
});

test("target.title が空のときは filePath を fallback として announceText に使う", () => {
  const task = makeTask({ id: "t1", title: "", filePath: "tasks/parent.md" });
  const outcome = selectTaskOutcome([task], "t1");

  expect(outcome?.announceText).toBe("「parent」を表示中");
});

test("同一 id が複数ある場合は最初の一致を採用する（task.id == filePath なので実質発生しないが防御挙動を固定）", () => {
  const first = makeTask({ id: "dup", title: "先", filePath: "tasks/dup.md" });
  const second = makeTask({
    id: "dup",
    title: "後",
    filePath: "tasks/dup.md",
  });
  const outcome = selectTaskOutcome([first, second], "dup");

  expect(outcome?.announceText).toBe("「先」を表示中");
});
