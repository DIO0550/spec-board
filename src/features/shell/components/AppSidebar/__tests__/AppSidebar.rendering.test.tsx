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
  expect(sidebar?.textContent).toContain("1 project");
  expect(sidebar?.textContent).toContain("payments-service");
});

test("複数のプロジェクト件数はprojectsと表示する", () => {
  renderSidebar({
    currentPath: undefined,
    recentProjects: [
      { path: "/work/one", name: "one" },
      { path: "/work/two", name: "two" },
    ],
  });
  expect(container?.textContent).toContain("2 projects");
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

test("Explorerのグループ見出しは開閉状態と大文字のproject名を持つ", () => {
  renderSidebar({ collapsed: false });

  const groupHeader = container?.querySelector(".spec-sidebar-group-header");
  const groupToggle = groupHeader?.querySelector("button");

  expect(groupHeader?.textContent).toContain("PAYMENTS-SERVICE");
  expect(groupToggle?.getAttribute("aria-expanded")).toBe("true");
  expect(groupToggle?.getAttribute("aria-label")).toBeNull();
});

test("Explorerのグループ見出しclickでタスクツリーを折りたためる", () => {
  renderSidebar({ collapsed: false });

  const groupHeader = container?.querySelector(".spec-sidebar-group-header");
  const groupToggle = groupHeader?.querySelector("button");

  act(() => {
    groupToggle?.click();
  });

  expect(groupToggle?.getAttribute("aria-expanded")).toBe("false");
  expect(container?.querySelector(".spec-sidebar-group-body")).toBeNull();

  act(() => {
    groupToggle?.click();
  });

  expect(groupToggle?.getAttribute("aria-expanded")).toBe("true");
  expect(container?.querySelector(".spec-sidebar-group-body")).not.toBeNull();
});
