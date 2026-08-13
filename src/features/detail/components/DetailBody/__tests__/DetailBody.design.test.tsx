import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task } from "@/types/task";
import { DetailBody } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const task = Task.fromPayload({
  id: "issue-7",
  title: "カードのドラッグ操作を改善",
  status: "In Progress",
  priority: "High",
  labels: ["frontend", "a11y"],
  due: "2026-08-20",
  links: [],
  children: ["tasks/child.md"],
  reverseLinks: [],
  body: "## 概要\n\n本文",
  filePath: "tasks/card-drag-drop.md",
  extras: { author: "taro" },
});

test("Issue header、3 tabs、activity、comment composerを表示する", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(DetailBody, {
        task,
        subIssueCounts: { done: 0, total: 1 },
        onTitleConfirm: vi.fn(),
        onBodyConfirm: vi.fn(),
      }),
    );
  });

  expect(
    container.querySelector('[data-testid="detail-issue-header"]'),
  ).toBeTruthy();
  expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
  expect(
    container.querySelector('[data-testid="detail-activity"]'),
  ).toBeTruthy();
  expect(
    container.querySelector('[data-testid="detail-comment-composer"]'),
  ).toBeTruthy();
});
