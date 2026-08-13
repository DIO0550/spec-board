import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { AppSidebar } from "..";

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

const renderSidebar = (
  props: Partial<Parameters<typeof AppSidebar>[0]> = {},
): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(AppSidebar, {
        projectName: "payments-service",
        currentPath: "/work/payments-service",
        recentProjects: [],
        tasks: [],
        onOpenProject: vi.fn(),
        onOpenProjectPath: vi.fn(),
        onSelectTask: vi.fn(),
        ...props,
      }),
    );
  });
};

test("展開時は248px幅のプロジェクトexplorerを表示する", () => {
  renderSidebar({ collapsed: false });

  const sidebar = container?.querySelector("aside");
  expect(sidebar?.className).toContain("w-[248px]");
  expect(sidebar?.textContent).toContain("spec-board");
  expect(sidebar?.textContent).toContain("payments-service");
});

test("折りたたみ時はrailを残さずsidebarを描画しない", () => {
  renderSidebar({ collapsed: true });

  expect(container?.querySelector("aside")).toBeNull();
  expect(container?.textContent).toBe("");
});

test("閉じるボタンで外部toggleを呼ぶ", () => {
  const onToggle = vi.fn();
  renderSidebar({ collapsed: false, onToggle });

  const button = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="サイドバーを閉じる"]',
  );
  act(() => {
    button?.click();
  });

  expect(onToggle).toHaveBeenCalledTimes(1);
});
