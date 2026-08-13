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

test("loading stateはviewer操作を表示しない", () => {
  renderTab({ status: "loading" });
  expect(container?.textContent).toContain("設定ファイルを読み込んでいます");
  expect(buttonByText("コピー")).toBeUndefined();
});

test("error stateは失敗理由をalertで表示する", () => {
  renderTab({ status: "error", error: "読み込み失敗" });
  expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
    "読み込み失敗",
  );
});

test("ready stateでも操作失敗理由をalertで表示する", () => {
  renderTab({ status: "ready", error: "設定ファイルを開けませんでした" });
  expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
    "設定ファイルを開けませんでした",
  );
  expect(buttonByText("コピー")).toBeDefined();
});

test("再生成中はbuttonをdisabledにする", () => {
  renderTab({ initialFile: "guide", isRegenerating: true });
  expect(buttonByText("再生成中")?.disabled).toBe(true);
});
