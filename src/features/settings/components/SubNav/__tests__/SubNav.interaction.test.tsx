import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { SettingsTab } from "@/features/settings/types";
import { SubNav, subNavPanelId, subNavTabId } from "..";

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

const tabA: SettingsTab = { id: "labels", label: "ラベル" };
const tabB: SettingsTab = { id: "appearance", label: "外観" };

/**
 * SubNav をレンダリングするヘルパー
 * @param props - SubNav に渡す props（部分指定可）
 */
const renderSubNav = (props: Partial<Parameters<typeof SubNav>[0]> = {}) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(SubNav, {
        tabs: [tabA],
        activeTabId: "labels",
        onSelect: vi.fn(),
        ...props,
      }),
    );
  });
};
test("onBack未指定時は戻るボタンを描画しない", () => {
  renderSubNav();
  const backButton = Array.from(
    container?.querySelectorAll("button") ?? [],
  ).find((button) => button.textContent?.includes("戻る"));
  expect(backButton).toBeUndefined();
});

test("タブが 1 枠でも role=tab の button が tablist 配下に 1 個描画される", () => {
  renderSubNav({ tabs: [tabA] });
  const tablist = container?.querySelector('[role="tablist"]');
  expect(tablist).not.toBeNull();
  const tabs = tablist?.querySelectorAll('[role="tab"]') ?? [];
  expect(tabs.length).toBe(1);
});

test("アクティブタブに aria-selected=true と aria-controls(panel id) が付く", () => {
  renderSubNav({ tabs: [tabA, tabB], activeTabId: "labels" });
  const activeTab = container?.querySelector(`#${subNavTabId("labels")}`);
  expect(activeTab?.getAttribute("aria-selected")).toBe("true");
  expect(activeTab?.getAttribute("aria-controls")).toBe(
    subNavPanelId("labels"),
  );
  const inactiveTab = container?.querySelector(`#${subNavTabId("appearance")}`);
  expect(inactiveTab?.getAttribute("aria-selected")).toBe("false");
});

test("非アクティブタブの click で onSelect がそのタブ ID で 1 回呼ばれる", () => {
  const onSelect = vi.fn();
  renderSubNav({ tabs: [tabA, tabB], activeTabId: "labels", onSelect });
  const inactiveTab = container?.querySelector<HTMLButtonElement>(
    `#${subNavTabId("appearance")}`,
  );
  inactiveTab?.click();
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith("appearance");
});

test("タブ 2 枠で role=tab が 2 個描画される（前方互換）", () => {
  renderSubNav({ tabs: [tabA, tabB], activeTabId: "labels" });
  const tabs = container?.querySelectorAll('[role="tab"]') ?? [];
  expect(tabs.length).toBe(2);
});

test("タブアイコンのラッパーに stroke 表示用クラスが付く", () => {
  renderSubNav({ tabs: [tabA] });
  const iconWrapper = container?.querySelector(
    `#${subNavTabId("labels")} > span`,
  );

  expect(iconWrapper?.className).toContain("spec-stroke-icon");
});

test("外観タブにプラス記号ではなく太陽アイコンを描画する", () => {
  renderSubNav({ tabs: [tabB], activeTabId: "appearance" });
  const icon = container?.querySelector(`#${subNavTabId("appearance")} svg`);

  expect(icon?.querySelector('circle[r="4"]')).not.toBeNull();
  expect(icon?.querySelector("path")?.getAttribute("d")).toContain("M12 2v2");
});

test("件数pillのDOMテキストとアクセシブル名を空白で区切る", () => {
  const countTab = { ...tabA, count: 0 };
  renderSubNav({ tabs: [countTab] });
  const tab = container?.querySelector(`#${subNavTabId("labels")}`);

  expect(tab?.textContent).toContain("ラベル 0");
  expect(tab?.getAttribute("aria-label")).toBe("ラベル 0件");
});
