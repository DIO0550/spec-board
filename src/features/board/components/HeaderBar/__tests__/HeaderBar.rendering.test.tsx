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

function renderHeaderBar(props: Partial<Parameters<typeof HeaderBar>[0]> = {}) {
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
  return root;
}

test("プロジェクト名が表示される", async () => {
  renderHeaderBar({ projectName: "My Project" });
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("My Project");
  });
});

test("未選択時はデフォルト名「spec-board」が表示される", async () => {
  renderHeaderBar();
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("spec-board");
  });
});

test("設定ボタンと「開く」ボタンが表示される", async () => {
  renderHeaderBar();
  await vi.waitFor(() => {
    const buttons = container?.querySelectorAll("button") ?? [];
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts).toContain("設定");
    expect(texts).toContain("開く");
  });
});

test("設定ボタンクリックでコールバックが呼ばれる", async () => {
  const onSettingsClick = vi.fn();
  renderHeaderBar({ onSettingsClick });
  let btn: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "設定",
    );
    expect(btn).toBeDefined();
  });
  btn?.click();
  expect(onSettingsClick).toHaveBeenCalledTimes(1);
});

test("「開く」ボタンクリックでコールバックが呼ばれる", async () => {
  const onOpenClick = vi.fn();
  renderHeaderBar({ onOpenClick });
  let btn: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "開く",
    );
    expect(btn).toBeDefined();
  });
  btn?.click();
  expect(onOpenClick).toHaveBeenCalledTimes(1);
});

test("view 未指定（既定 board）では設定ボタンが「設定」表示", async () => {
  renderHeaderBar();
  await vi.waitFor(() => {
    const texts = Array.from(container?.querySelectorAll("button") ?? []).map(
      (b) => b.textContent,
    );
    expect(texts).toContain("設定");
    expect(texts).not.toContain("ボードへ戻る");
  });
});

test("view='board' では設定ボタンが「設定」表示", async () => {
  renderHeaderBar({ view: "board" });
  await vi.waitFor(() => {
    const texts = Array.from(container?.querySelectorAll("button") ?? []).map(
      (b) => b.textContent,
    );
    expect(texts).toContain("設定");
    expect(texts).not.toContain("ボードへ戻る");
  });
});

test("view='settings' では設定ボタンが「ボードへ戻る」表示", async () => {
  renderHeaderBar({ view: "settings" });
  await vi.waitFor(() => {
    const texts = Array.from(container?.querySelectorAll("button") ?? []).map(
      (b) => b.textContent,
    );
    expect(texts).toContain("ボードへ戻る");
    expect(texts).not.toContain("設定");
  });
});

test("view='detail' では設定ボタンが「設定」表示（detail は board 扱いの文言）", async () => {
  renderHeaderBar({ view: "detail" });
  await vi.waitFor(() => {
    const texts = Array.from(container?.querySelectorAll("button") ?? []).map(
      (b) => b.textContent,
    );
    expect(texts).toContain("設定");
    expect(texts).not.toContain("ボードへ戻る");
  });
});

test("view='settings' でも設定ボタン click で onSettingsClick が呼ばれる", async () => {
  const onSettingsClick = vi.fn();
  renderHeaderBar({ view: "settings", onSettingsClick });
  let btn: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "ボードへ戻る",
    );
    expect(btn).toBeDefined();
  });
  btn?.click();
  expect(onSettingsClick).toHaveBeenCalledTimes(1);
});

test("onMilestoneClick 未指定時はマイルストーンボタンを表示しない", async () => {
  renderHeaderBar();
  await vi.waitFor(() => {
    const texts = Array.from(container?.querySelectorAll("button") ?? []).map(
      (b) => b.textContent,
    );
    expect(texts).not.toContain("マイルストーン");
  });
});

test("onMilestoneClick 指定時はマイルストーンボタンが表示され click で呼ばれる", async () => {
  const onMilestoneClick = vi.fn();
  renderHeaderBar({ onMilestoneClick });
  let btn: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    btn = Array.from(container?.querySelectorAll("button") ?? []).find(
      (b): b is HTMLButtonElement => b.textContent === "マイルストーン",
    );
    expect(btn).toBeDefined();
  });
  btn?.click();
  expect(onMilestoneClick).toHaveBeenCalledTimes(1);
});

test("view='milestone' ではマイルストーンボタンが「ボードへ戻る」表示", async () => {
  renderHeaderBar({ view: "milestone", onMilestoneClick: vi.fn() });
  await vi.waitFor(() => {
    const texts = Array.from(container?.querySelectorAll("button") ?? []).map(
      (b) => b.textContent,
    );
    expect(texts).toContain("ボードへ戻る");
    expect(texts).not.toContain("マイルストーン");
  });
});
