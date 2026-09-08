import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { type LabelsResource, useLabels } from "@/hooks/useLabels";
import { getLabels } from "@/lib/tauri";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getLabels: vi.fn(),
  };
});

const getLabelsMock = vi.mocked(getLabels);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let hadIsReactActEnvironment = false;
let previousIsReactActEnvironment: boolean | undefined;

beforeAll(() => {
  hadIsReactActEnvironment =
    "IS_REACT_ACT_ENVIRONMENT" in reactActEnvironmentGlobal;
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
  // 元々キーが無かった場合は値を戻すだけでは `in` 判定が変わったままになるため、
  // キー自体を削除して他テストへの汚染を防ぐ。
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getLabelsMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const captured: { current: LabelsResource | null } = { current: null };

const capture = (r: LabelsResource): void => {
  captured.current = r;
};

const Probe = ({
  projectKey,
  onResult,
}: {
  projectKey: string | undefined;
  onResult: (result: LabelsResource) => void;
}) => {
  const result = useLabels(projectKey);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const mount = async (
  projectKey: string | undefined,
): Promise<LabelsResource | null> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe, { projectKey, onResult: capture }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return captured.current;
};

const rerender = async (
  projectKey: string | undefined,
): Promise<LabelsResource | null> => {
  await act(async () => {
    root?.render(createElement(Probe, { projectKey, onResult: capture }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return captured.current;
};

test("同一 projectKey で再レンダーしても labels 配列の参照が変わらない", async () => {
  getLabelsMock.mockResolvedValue(
    Result.ok({ labels: [{ name: "bug", color: "red" }], usageCounts: {} }),
  );
  const first = await mount("proj-1");
  const firstLabels = first?.labels;
  const second = await rerender("proj-1");
  expect(second?.labels).toBe(firstLabels);
});

test("同一 projectKey で再レンダーしても戻り値オブジェクトの参照が変わらない", async () => {
  getLabelsMock.mockResolvedValue(
    Result.ok({ labels: [{ name: "bug", color: "red" }], usageCounts: {} }),
  );
  const first = await mount("proj-1");
  const second = await rerender("proj-1");
  expect(second).toBe(first);
});

test("同一 projectKey で再レンダーしても reload 関数の参照が変わらない", async () => {
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
  const first = await mount("proj-1");
  const firstReload = first?.reload;
  const second = await rerender("proj-1");
  expect(second?.reload).toBe(firstReload);
});

test("projectKey 未指定（idle）で再レンダーしても labels 配列の参照が変わらない", async () => {
  const first = await mount(undefined);
  const firstLabels = first?.labels;
  const second = await rerender(undefined);
  expect(second?.labels).toBe(firstLabels);
});
