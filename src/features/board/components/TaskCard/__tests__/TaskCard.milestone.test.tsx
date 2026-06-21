import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { MilestoneDefinition } from "@/lib/tauri";
import { Task, type TaskPayload } from "@/types/task";
import { TaskCard } from "..";
import { type CardWrapperArgs, wrapWithCardProvider } from "./_testHelpers";

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

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

/**
 * BoardCardProvider 配下に TaskCard を mount する。
 * @param props TaskCard に渡す props（fromColumn はデフォルト "Todo"）
 * @param providerArgs Provider に追加で渡す引数（milestonesByName 等）
 */
const render = (
  props: Omit<Parameters<typeof TaskCard>[0], "fromColumn">,
  providerArgs: CardWrapperArgs = {},
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      wrapWithCardProvider(<TaskCard fromColumn="Todo" {...props} />, {
        task: props.task,
        ...providerArgs,
      }),
    );
  });
};

test("milestone があるとバッジが表示される", async () => {
  const byName = new Map<string, MilestoneDefinition>([
    ["v0.3", { name: "v0.3", title: "v0.3 リリース", due: "2026-07-31" }],
  ]);
  render(
    {
      task: createTask({ milestone: "v0.3" }),
      onClick: vi.fn(),
    },
    { milestonesByName: byName },
  );
  await vi.waitFor(() => {
    const badge = container?.querySelector('[data-testid="milestone-badge"]');
    expect(badge?.textContent).toContain("v0.3 リリース");
    expect(badge?.textContent).toContain("2026-07-31");
  });
});

test("milestone が未割当のときバッジは表示されない", async () => {
  render({ task: createTask({ milestone: undefined }), onClick: vi.fn() });
  await vi.waitFor(() => {
    expect(container?.querySelector('[data-testid="task-card"]')).toBeTruthy();
  });
  expect(
    container?.querySelector('[data-testid="milestone-badge"]'),
  ).toBeNull();
});

test("milestonesByName 未指定でも name でバッジ表示される", async () => {
  render({ task: createTask({ milestone: "v0.9" }), onClick: vi.fn() });
  await vi.waitFor(() => {
    const badge = container?.querySelector('[data-testid="milestone-badge"]');
    expect(badge?.textContent).toContain("v0.9");
  });
});
