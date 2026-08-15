import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { TaskProjectionMap } from "@/domains/task-projection";
import { Task } from "@/types/task";
import { MilestoneDetailSidebar } from "..";

const makeTask = (id: string, status: string): Task =>
  Task.fromPayload({
    id,
    title: id,
    status,
    milestone: "M1",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `tasks/${id}.md`,
    extras: {},
    warnings: [],
  });

const statusDoneProjectionOpenTask = makeTask("projection-done", "Todo");
const statusOpenProjectionPendingTask = makeTask("projection-pending", "Done");

const taskProjections: TaskProjectionMap = new Map([
  [
    statusDoneProjectionOpenTask.filePath,
    {
      subIssueProgress: { done: 0, total: 0 },
      isDone: true,
      childFilePaths: [],
    },
  ],
  [
    statusOpenProjectionPendingTask.filePath,
    {
      subIssueProgress: { done: 0, total: 0 },
      isDone: false,
      childFilePaths: [],
    },
  ],
]);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

test("task status と異なる TaskProjection.isDone を sidebar 表示の source にする", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneDetailSidebar, {
        def: { name: "M1", state: "open" },
        status: "open",
        projection: {
          done: 1,
          total: 2,
          taskFilePaths: [
            statusDoneProjectionOpenTask.filePath,
            statusOpenProjectionPendingTask.filePath,
          ],
        },
        showRatio: true,
        tasks: [statusDoneProjectionOpenTask, statusOpenProjectionPendingTask],
        taskProjections,
      }),
    );
  });

  const rows = Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-testid="milestone-sidebar-task"]',
    ),
  );
  const titleClass = (row: HTMLElement): string =>
    row.querySelectorAll("span")[2]?.className ?? "";
  const dotClass = (row: HTMLElement): string =>
    row.querySelectorAll("span")[0]?.className ?? "";

  expect(titleClass(rows[0])).toContain("line-through");
  expect(dotClass(rows[0])).toContain("--color-ms-success");
  expect(titleClass(rows[1])).not.toContain("line-through");
  expect(dotClass(rows[1])).toContain("--color-ms-todo");
});

test("所属タスクをクリックするとtask id付きでコールバックを呼ぶ", () => {
  const onTaskClick = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneDetailSidebar, {
        def: { name: "M1", state: "open" },
        status: "open",
        projection: {
          done: 1,
          total: 1,
          taskFilePaths: [statusDoneProjectionOpenTask.filePath],
        },
        showRatio: true,
        tasks: [statusDoneProjectionOpenTask],
        taskProjections,
        onTaskClick,
      }),
    );
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-testid="milestone-sidebar-task"]',
      )
      ?.click();
  });
  expect(onTaskClick).toHaveBeenCalledWith(statusDoneProjectionOpenTask.id);
});

test("最終更新日時を更新ラベルで表示する", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneDetailSidebar, {
        def: { name: "M1", state: "open", updated: "2026-08-15" },
        status: "open",
        projection: { done: 0, total: 0, taskFilePaths: [] },
        showRatio: true,
        tasks: [],
        taskProjections: new Map(),
      }),
    );
  });

  const updatedLabel = Array.from(container.querySelectorAll("dt")).find(
    (label) => label.textContent?.trim() === "更新",
  );
  expect(updatedLabel?.nextElementSibling?.textContent).toContain("2026-08-15");
});

test("showRatio=false のとき進捗率と実績線を表示しない", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneDetailSidebar, {
        def: { name: "M1", state: "open" },
        status: "open",
        projection: { done: 1, total: 2, taskFilePaths: [] },
        showRatio: false,
        tasks: [],
        taskProjections: new Map(),
      }),
    );
  });

  const burndown = container?.querySelector(
    '[data-testid="milestone-burndown"]',
  );
  expect(burndown?.textContent).not.toContain("50% complete");
  expect(
    burndown?.querySelector('path[stroke="var(--color-accent)"]'),
  ).toBeNull();
  expect(burndown?.querySelector("circle")).toBeNull();
});

test.each([
  ["v1.7", "v1.7.0"],
  ["v1.7.0", "v1.7.0"],
  ["release", "release"],
])("バージョン名を表示用ラベルへ整形する", (name, expected) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneDetailSidebar, {
        def: { name, state: "open" },
        status: "open",
        projection: { done: 0, total: 0, taskFilePaths: [] },
        showRatio: true,
        tasks: [],
        taskProjections: new Map(),
      }),
    );
  });

  const versionLabel = container?.querySelector(
    "aside > section:first-of-type > header > span:last-child",
  );
  expect(versionLabel?.textContent?.trim()).toBe(expected);
});
