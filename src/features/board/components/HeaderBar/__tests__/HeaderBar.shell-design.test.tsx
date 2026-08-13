import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ThemeProvider } from "@/features/shell";
import { HeaderBar } from "..";

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

const renderHeader = (
  props: Partial<Parameters<typeof HeaderBar>[0]> = {},
): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        ThemeProvider,
        null,
        createElement(HeaderBar, {
          onSettingsClick: vi.fn(),
          onOpenClick: vi.fn(),
          ...props,
        }),
      ),
    );
  });
};

test("開いているプロジェクトのbrand・パス・監視数を48px topbarに表示する", () => {
  renderHeader({
    projectName: "payments-service",
    projectPath: "/work/payments-service",
    watchedFileCount: 127,
  });

  const header = container?.querySelector("header");
  expect(header?.className).toContain("h-12");
  expect(header?.textContent).toContain("spec-board");
  expect(header?.textContent).toContain("payments-service");
  expect(header?.textContent).toContain("/work/payments-service");
  expect(header?.textContent).toContain("監視 127 files");
});

test("新規タスクボタンでコールバックを呼ぶ", () => {
  const onNewTaskClick = vi.fn();
  renderHeader({
    projectName: "payments-service",
    onNewTaskClick,
  });

  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (candidate) => candidate.textContent?.includes("新規タスク") === true,
  );
  act(() => {
    button?.click();
  });

  expect(onNewTaskClick).toHaveBeenCalledTimes(1);
});
