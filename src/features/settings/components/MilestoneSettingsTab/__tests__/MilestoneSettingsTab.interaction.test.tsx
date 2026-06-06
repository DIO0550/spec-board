import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { MilestoneDefinition } from "@/lib/tauri";
import { createMilestone, updateMilestone } from "@/lib/tauri";
import { Result } from "@/utils/result";
import { MilestoneSettingsTab } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
  };
});

const updateMock = vi.mocked(updateMilestone);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previous: boolean | undefined;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  previous = reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  updateMock.mockReset();
  updateMock.mockResolvedValue(Result.ok(undefined));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
});

const milestoneWithDescription: MilestoneDefinition = {
  name: "v0.3",
  title: "v0.3 リリース",
  description: "重要な備考",
  due: "2026-07-31",
  order: 1,
  state: "open",
};

const resource: MilestonesResource = {
  milestones: [milestoneWithDescription],
  usageCounts: { "v0.3": 0 },
  byName: new Map([["v0.3", milestoneWithDescription]]),
  status: "loaded",
  reload: vi.fn(async () => {}),
};

const mount = async (): Promise<void> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(MilestoneSettingsTab, { resource }));
  });
};

// 見つからなければ undefined を返し、呼び出し側の dispatchEvent で自然に失敗する
// （テストルールにより条件分岐は使わない）。
const findButtonByText = (text: string): HTMLButtonElement =>
  Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

test("編集→更新で UI 非対応の description が既存値のまま引き継がれる", async () => {
  await mount();

  await act(async () => {
    findButtonByText("編集").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });

  await act(async () => {
    const form = container?.querySelector("form");
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });

  expect(updateMock).toHaveBeenCalledTimes(1);
  expect(updateMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: "v0.3", description: "重要な備考" }),
  );
});

const createMock = vi.mocked(createMilestone);

const fillField = (label: string, value: string): void => {
  const input = container?.querySelector(
    `[aria-label="${label}"]`,
  ) as HTMLInputElement | null;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input?.dispatchEvent(new Event("input", { bubbles: true }));
};

test.each([
  ["1.5", undefined],
  ["2abc", undefined],
  ["-1", undefined],
  ["", undefined],
  ["3", 3],
  ["0", 0],
])("新規作成で order=%j は %j に正規化される（部分パースを受理しない）", async (input, expected) => {
  createMock.mockReset();
  createMock.mockResolvedValue(Result.ok(undefined));
  await mount();

  await act(async () => {
    fillField("name", "v1.0");
    fillField("order", input);
  });

  await act(async () => {
    const form = container?.querySelector("form");
    form?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });

  expect(createMock).toHaveBeenCalledTimes(1);
  expect(createMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: "v1.0", order: expected }),
  );
});
