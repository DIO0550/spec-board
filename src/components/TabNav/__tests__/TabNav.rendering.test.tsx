import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TabNav } from "..";

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

test("44pxのsubbarにタブの件数pillを表示する", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(TabNav, {
        tabs: [
          { id: "board", label: "ボード", count: 14 },
          { id: "list", label: "一覧", count: 22 },
        ],
        activeTabId: "board",
        idPrefix: "views",
        onSelect: vi.fn(),
      }),
    );
  });

  const tablist = container.querySelector('[role="tablist"]');
  expect(tablist?.parentElement?.className).toContain("h-11");
  expect(tablist?.textContent).toContain("ボード14");
  expect(tablist?.textContent).toContain("一覧22");
  expect(container.querySelectorAll("[data-tab-count]")).toHaveLength(2);
});

test("trailing操作群をtablistの外に配置する", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(TabNav, {
        tabs: [{ id: "board", label: "ボード" }],
        activeTabId: "board",
        idPrefix: "views",
        ariaLabel: "ボードの表示形態",
        onSelect: vi.fn(),
        trailing: createElement(
          "button",
          { type: "button", "data-testid": "tab-trailing" },
          "検索",
        ),
      }),
    );
  });

  const tablist = container.querySelector('[role="tablist"]');
  const trailing = container.querySelector('[data-testid="tab-trailing"]');
  expect(tablist?.querySelector('[data-testid="tab-trailing"]')).toBeNull();
  expect(trailing?.closest('[role="tablist"]')).toBeNull();
  expect(trailing?.parentElement?.getAttribute("role")).toBe("presentation");
});
