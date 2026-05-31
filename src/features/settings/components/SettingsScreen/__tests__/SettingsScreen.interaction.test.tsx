import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getLabels } from "@/lib/tauri";
import { Result } from "@/utils/result";
import { SettingsScreen } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getLabels: vi.fn(),
  };
});

const getLabelsMock = vi.mocked(getLabels);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getLabelsMock.mockReset();
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [] }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * SettingsScreen をマウントするヘルパー
 */
const mountSettingsScreen = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(SettingsScreen));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

test("既定タブ labels の tabpanel と SubNav の tab が描画される", async () => {
  await mountSettingsScreen();
  const tab = container?.querySelector('[role="tab"]');
  expect(tab?.textContent).toBe("ラベル");
  const panel = container?.querySelector('[role="tabpanel"]');
  expect(panel).not.toBeNull();
});

test("アクティブ tab と tabpanel が aria 属性で相互参照される", async () => {
  await mountSettingsScreen();
  const tab = container?.querySelector('[role="tab"]');
  const panel = container?.querySelector('[role="tabpanel"]');
  // tab.aria-controls === panel.id
  expect(tab?.getAttribute("aria-controls")).toBe(panel?.getAttribute("id"));
  // panel.aria-labelledby === tab.id
  expect(panel?.getAttribute("aria-labelledby")).toBe(tab?.getAttribute("id"));
});
