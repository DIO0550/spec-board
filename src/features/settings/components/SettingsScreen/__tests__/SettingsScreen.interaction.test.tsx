import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { LabelsResource } from "@/hooks/useLabels";
import type { MilestonesResource } from "@/hooks/useMilestones";
import { getLabels } from "@/lib/tauri";
import { Result } from "@/utils/result";
import { useMilestoneMutations } from "../../../hooks/useMilestoneMutations";
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

// マイルストーンリソースは App から共有される前提（SettingsScreen 自身は取得しない）。
const milestonesResource: MilestonesResource = {
  milestones: [],
  usageCounts: {},
  byName: new Map(),
  status: "loaded",
  reload: vi.fn(async () => {}),
};

// ラベルリソースも App から共有される前提（settings → labels タブへ配る）。
const labelsResource: LabelsResource = {
  labels: [],
  usageCounts: {},
  byName: new Map(),
  status: "loaded",
  reload: vi.fn(async () => {}),
};

const noopUsageClick = (_name: string): void => {};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getLabelsMock.mockReset();
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

// milestoneMutations は App が hoist 保持する prop になったため、テストでも
// フックを呼ぶ薄い Harness を挟んで本物のインスタンスを注入する。
const Harness = () => {
  const milestoneMutations = useMilestoneMutations(milestonesResource.reload);
  return createElement(SettingsScreen, {
    labels: labelsResource,
    milestones: milestonesResource,
    milestoneProjections: new Map(),
    milestoneMutations,
    onLabelUsageClick: noopUsageClick,
  });
};

/**
 * SettingsScreen をマウントするヘルパー
 */
const mountSettingsScreen = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Harness));
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
