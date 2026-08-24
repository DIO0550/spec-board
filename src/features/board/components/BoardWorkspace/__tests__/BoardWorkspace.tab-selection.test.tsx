import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskForest } from "@/domains/task-forest";
import { TaskProjection } from "@/domains/task-projection";
import { BoardWorkspace } from "..";

const injectedTab = vi.hoisted(() => ({ id: "board" }));

vi.mock("@/components/TabNav", async () => {
  const actual = await vi.importActual<typeof import("@/components/TabNav")>(
    "@/components/TabNav",
  );
  return {
    ...actual,
    TabNav: ({ onSelect }: { onSelect: (tabId: never) => void }) =>
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "injected-board-tab",
          onClick: () => onSelect(injectedTab.id as never),
        },
        "injected tab",
      ),
  };
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  injectedTab.id = "board";
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  localStorage.clear();
});

/**
 * BoardWorkspaceを最小propsで描画する。
 * @param onGuideClick - GUIDE.mdタブ選択時のcallback
 */
const renderWorkspace = (onGuideClick: () => void): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(BoardWorkspace, {
        projections: TaskProjection.emptyMap,
        taskTree: TaskForest.empty,
        columns: [{ name: "Todo", order: 0 }],
        tasks: [],
        onAddTask: () => {},
        onTaskClick: () => {},
        onGuideClick,
      }),
    );
  });
};

test("runtimeから未知タブIDが注入されてもview・storage・GUIDE actionを変更しない", () => {
  localStorage.setItem("spec-board:viewMode", "list");
  injectedTab.id = "unknown";
  const onGuideClick = vi.fn();
  renderWorkspace(onGuideClick);

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-testid="injected-board-tab"]')
      ?.click();
  });

  expect(container?.querySelector("[data-board-view='list']")).not.toBeNull();
  expect(localStorage.getItem("spec-board:viewMode")).toBe("list");
  expect(onGuideClick).not.toHaveBeenCalled();
});
