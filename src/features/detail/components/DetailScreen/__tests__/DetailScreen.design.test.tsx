import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import { Task } from "@/types/task";
import { DetailScreen } from "..";

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
  title: "Issue detail",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "本文",
  filePath: "tasks/issue-detail.md",
});

test("44px subbarと820px本文・340px propertiesの2ペインを表示する", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(DetailScreen, {
        task,
        allTasks: [task],
        columns: [{ name: "Todo", order: 0 }],
        projections: TaskProjection.emptyMap,
        onBack: vi.fn(),
        onTaskUpdate: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
  });

  expect(
    container.querySelector('[data-testid="detail-subbar"]')?.className,
  ).toContain("h-11");
  expect(
    container.querySelector('[data-testid="detail-layout"]')?.className,
  ).toContain("md:grid-cols-[minmax(0,1fr)_340px]");
  expect(
    container.querySelector('[data-testid="detail-content-inner"]')?.className,
  ).toContain("max-w-[820px]");
});

test("viewportの残高内に固定して本文とpropertiesを個別スクロールする", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(DetailScreen, {
        task,
        allTasks: [task],
        columns: [{ name: "Todo", order: 0 }],
        projections: TaskProjection.emptyMap,
        onBack: vi.fn(),
        onTaskUpdate: vi.fn(),
        onDelete: vi.fn(),
      }),
    );
  });

  const screen = container.querySelector<HTMLElement>(
    'section[aria-label="タスク詳細"]',
  );
  const layout = container.querySelector<HTMLElement>(
    '[data-testid="detail-layout"]',
  );
  const main = layout?.querySelector("main");
  const properties = layout?.lastElementChild;

  expect(screen?.className).toContain("h-full");
  expect(screen?.className).toContain("overflow-hidden");
  expect(layout?.className).toContain("min-h-0");
  expect(main?.className).toContain("min-h-0");
  expect(main?.className).toContain("overflow-y-auto");
  expect(properties?.className).toContain("min-h-0");
  expect(properties?.className).toContain("overflow-y-auto");
});
