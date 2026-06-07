import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ThemeProvider } from "@/features/shell";
import { AppearanceSettingsTab } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.removeAttribute("data-density");
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const renderTab = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(ThemeProvider, null, createElement(AppearanceSettingsTab)),
    );
  });
};

const clickButtonByText = async (text: string) => {
  let button: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    button = Array.from(container?.querySelectorAll("button") ?? []).find(
      (element): element is HTMLButtonElement =>
        element.textContent?.includes(text) ?? false,
    );
    expect(button).toBeDefined();
  });
  act(() => {
    button?.click();
  });
  return button;
};

test("ダークを選ぶと documentElement の data-theme が dark になる", async () => {
  renderTab();

  await clickButtonByText("ダーク");

  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("アクセント変更は localStorage に永続化される", async () => {
  renderTab();

  await clickButtonByText("グリーン");

  expect(localStorage.getItem("spec-board:appearance")).toContain("green");
  expect(document.documentElement.dataset.accent).toBe("green");
});

test("選択中のボタンは aria-pressed=true になる", async () => {
  renderTab();

  const button = await clickButtonByText("コンパクト");

  expect(button?.getAttribute("aria-pressed")).toBe("true");
});
