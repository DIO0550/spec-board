import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ConfigFileTab } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** @param props - ConfigFileTab props */
const renderTab = (props: Parameters<typeof ConfigFileTab>[0] = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(ConfigFileTab, props)));
};

/** @param text - button text @returns 一致button */
const buttonByText = (text: string): HTMLButtonElement | undefined =>
  Array.from(
    container?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((button) => button.textContent?.includes(text));

test("GUIDEへ切り替えると生成ファイルと再生成actionを表示する", () => {
  renderTab();
  act(() => buttonByText("GUIDE.md")?.click());
  expect(container?.textContent).toContain(".spec-board/GUIDE.md");
  expect(buttonByText("再生成")).toBeDefined();
});

test("copy・open・revealはpresentational callbackへ委譲する", () => {
  const onCopy = vi.fn();
  const onOpenExternal = vi.fn();
  const onRevealFolder = vi.fn();
  renderTab({ onCopy, onOpenExternal, onRevealFolder });
  act(() => buttonByText("コピー")?.click());
  act(() => buttonByText("外部エディタで開く")?.click());
  act(() => buttonByText("フォルダを開く")?.click());
  expect(onCopy).toHaveBeenCalledWith("config");
  expect(onOpenExternal).toHaveBeenCalledWith("config");
  expect(onRevealFolder).toHaveBeenCalledOnce();
});
