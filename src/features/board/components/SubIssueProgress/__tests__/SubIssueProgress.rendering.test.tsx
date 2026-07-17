import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { Task, type TaskFromPayloadInput } from "@/domains/task";
import { SubIssueProgress } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

function createTask(overrides: Partial<TaskFromPayloadInput> = {}): Task {
  return Task.fromPayload({
    id: "child-1",
    title: "子タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/child.md",
    ...overrides,
  });
}

function render(props: Parameters<typeof SubIssueProgress>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SubIssueProgress, props));
  });
}

test("total が 1 以上で進捗バーが表示される", () => {
  render({
    childTasks: [createTask({ id: "c1", status: "Todo" })],
    done: 0,
    total: 1,
    doneColumn: "Done",
  });
  const progressBar = container?.querySelector("[role='progressbar']");
  expect(progressBar).toBeTruthy();
});

test("視覚テキストには X/Y 数値を表示しない（フッターへ集約）", () => {
  render({
    childTasks: [createTask({ id: "c1", status: "Done" })],
    done: 2,
    total: 5,
    doneColumn: "Done",
  });
  expect(container?.textContent).not.toContain("2/5");
});

test("progressbar に進捗が aria 属性として残る（done=2/total=5 → aria-label と aria-valuenow=40）", () => {
  render({
    childTasks: [
      createTask({ id: "c1", status: "Done" }),
      createTask({ id: "c2", status: "Todo" }),
    ],
    done: 2,
    total: 5,
    doneColumn: "Done",
  });
  const bar = container?.querySelector("[role='progressbar']") as HTMLElement;
  expect(bar.getAttribute("aria-valuenow")).toBe("40");
  expect(bar.getAttribute("aria-label")).toBe("進捗 2/5");
});

test("▶ クリックで子タスクリストが展開される", () => {
  const directChildren = [
    createTask({ id: "c1", title: "タスクA", status: "Todo" }),
    createTask({ id: "c2", title: "タスクB", status: "Done" }),
  ];
  render({
    childTasks: directChildren,
    done: 1,
    total: 2,
    doneColumn: "Done",
  });
  const details = container?.querySelector("details") as HTMLDetailsElement;
  expect(details.open).toBe(false);

  const summary = details.querySelector("summary") as HTMLElement;
  act(() => {
    summary.click();
  });

  expect(details.open).toBe(true);
  expect(container?.textContent).toContain("タスクA");
  expect(container?.textContent).toContain("タスクB");
});

test("total が 0 で非表示", () => {
  render({ childTasks: [], done: 0, total: 0, doneColumn: "Done" });
  expect(container?.innerHTML).toBe("");
});

test("全子孫タスクが完了の場合、バーが 100% になる", () => {
  render({
    childTasks: [createTask({ id: "c1", status: "Done" })],
    done: 3,
    total: 3,
    doneColumn: "Done",
  });
  const progressBar = container?.querySelector(
    "[role='progressbar']",
  ) as HTMLElement;
  expect(progressBar.getAttribute("aria-valuenow")).toBe("100");
});

test("<details> 内 <ul> の <li> 数は childTasks.length と一致する（done/total ではない）", () => {
  render({
    childTasks: [
      createTask({ id: "c1", title: "child1", status: "Todo" }),
      createTask({ id: "c2", title: "child2", status: "Todo" }),
    ],
    done: 0,
    total: 4,
    doneColumn: "Done",
  });
  const lis = container?.querySelectorAll("details ul li");
  expect(lis?.length).toBe(2);
});
