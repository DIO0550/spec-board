import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { MilestoneProjectionMap } from "@/domains/milestone-projection";
import type { MilestonesResource } from "@/hooks/useMilestones";
import type { MilestoneDefinition } from "@/lib/tauri";
import { createMilestone, deleteMilestone, updateMilestone } from "@/lib/tauri";
import { Result } from "@/utils/result";
import { useMilestoneMutations } from "../../../hooks/useMilestoneMutations";
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
const deleteMock = vi.mocked(deleteMilestone);

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
  deleteMock.mockReset();
  deleteMock.mockResolvedValue(Result.ok({ usageCount: 3 }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
  vi.unstubAllGlobals();
});

const milestoneWithDescription: MilestoneDefinition = {
  name: "v0.3",
  title: "v0.3 リリース",
  description: "重要な備考",
  due: "2026-07-31",
  order: 1,
  state: "open",
};

const specialMilestone: MilestoneDefinition = {
  name: "__proto__",
  title: "特殊名",
  state: "open",
};

const unusedMilestone: MilestoneDefinition = {
  name: "unused",
  title: "未使用",
  state: "open",
};

const resource: MilestonesResource = {
  milestones: [milestoneWithDescription, specialMilestone, unusedMilestone],
  usageCounts: JSON.parse('{"v0.3":0,"__proto__":0,"unused":99}') as Record<
    string,
    number
  >,
  byName: new Map([
    ["v0.3", milestoneWithDescription],
    ["__proto__", specialMilestone],
    ["unused", unusedMilestone],
  ]),
  status: "loaded",
  reload: vi.fn(async () => {}),
};

const milestoneProjections: MilestoneProjectionMap = new Map([
  [
    "v0.3",
    {
      done: 1,
      total: 3,
      taskFilePaths: ["tasks/a.md", "tasks/b.md", "tasks/c.md"],
    },
  ],
  [
    "__proto__",
    {
      done: 0,
      total: 2,
      taskFilePaths: ["tasks/special-a.md", "tasks/special-b.md"],
    },
  ],
]);

// mutations は App から hoist された CRUD ハンドルを受け取る prop になったため、
// テスト側ではフックを呼ぶ薄い Harness を挟んで本物のインスタンスを注入する
// （並行書き込み serialize の挙動はフック側の単体テストでカバー済み）。
const Harness = ({ resource }: { resource: MilestonesResource }) => {
  const mutations = useMilestoneMutations(resource.reload);
  return createElement(MilestoneSettingsTab, {
    resource,
    milestoneProjections,
    mutations,
  });
};

const mount = async (): Promise<void> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Harness, { resource }));
  });
};

// 見つからなければ undefined を返し、呼び出し側の dispatchEvent で自然に失敗する
// （テストルールにより条件分岐は使わない）。
const findButtonByText = (text: string): HTMLButtonElement =>
  Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

const findDeleteButtonByMilestoneName = (name: string): HTMLButtonElement => {
  const row = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-testid="milestone-row"]') ??
      [],
  ).find((item) => item.textContent?.includes(name)) as HTMLElement;
  return Array.from(row.querySelectorAll("button")).find(
    (button) => button.textContent === "削除",
  ) as HTMLButtonElement;
};

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

test("stale usageCounts より live projection total を優先し特殊名も Map から表示する", async () => {
  await mount();
  const rows = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-testid="milestone-row"]') ??
      [],
  );

  expect(rows[0]?.textContent).toContain("使用 3");
  expect(rows[1]?.textContent).toContain("使用 2");
  expect(rows[2]?.textContent).toContain("使用 0");
});

test("削除確認は live projection total を使用する", async () => {
  const confirmMock = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmMock);
  await mount();

  await act(async () => {
    findButtonByText("削除").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });

  expect(confirmMock).toHaveBeenCalledWith(
    "「v0.3」は 3 件のタスクで使用中です。削除しますか？（タスクの値は残ります）",
  );
  expect(deleteMock).toHaveBeenCalledWith("v0.3");
});

test("利用中 milestone の削除確認をキャンセルすると remove を呼ばない", async () => {
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false),
  );
  await mount();

  await act(async () => {
    findDeleteButtonByMilestoneName("v0.3").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });

  expect(deleteMock).not.toHaveBeenCalled();
});

test("未使用 milestone は zero projection の確認文言から削除できる", async () => {
  const confirmMock = vi.fn(() => true);
  vi.stubGlobal("confirm", confirmMock);
  await mount();

  await act(async () => {
    findDeleteButtonByMilestoneName("unused").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  });

  expect(confirmMock).toHaveBeenCalledWith("「unused」を削除しますか？");
  expect(deleteMock).toHaveBeenCalledWith("unused");
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
  ["4294967295", 4_294_967_295],
  ["4294967296", undefined],
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
