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
import { type MilestonesResource, useMilestones } from "@/hooks/useMilestones";
import { getMilestones } from "@/lib/tauri";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getMilestones: vi.fn(),
  };
});

const getMilestonesMock = vi.mocked(getMilestones);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;

beforeAll(() => {
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  getMilestonesMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const captured: { current: MilestonesResource | null } = { current: null };

const capture = (r: MilestonesResource): void => {
  captured.current = r;
};

const Probe = ({
  projectKey,
  onResult,
}: {
  projectKey: string | undefined;
  onResult: (result: MilestonesResource) => void;
}) => {
  const result = useMilestones(projectKey);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const mount = async (
  projectKey: string | undefined,
): Promise<MilestonesResource | null> => {
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
): Promise<MilestonesResource | null> => {
  await act(async () => {
    root?.render(createElement(Probe, { projectKey, onResult: capture }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return captured.current;
};

test("同一 projectKey で再レンダーしても戻り値オブジェクトの参照が変わらない", async () => {
  getMilestonesMock.mockResolvedValue(
    Result.ok({
      milestones: [{ name: "v0.3", title: "v0.3 リリース" }],
      usageCounts: { "v0.3": 1 },
    }),
  );
  const first = await mount("proj-1");
  const second = await rerender("proj-1");
  expect(second).toBe(first);
});

test("同一 projectKey で再レンダーしても byName の Map 参照が変わらない", async () => {
  getMilestonesMock.mockResolvedValue(
    Result.ok({
      milestones: [{ name: "v0.3", title: "v0.3 リリース" }],
      usageCounts: { "v0.3": 1 },
    }),
  );
  const first = await mount("proj-1");
  const firstByName = first?.byName;
  const second = await rerender("proj-1");
  expect(second?.byName).toBe(firstByName);
});

test("同一 projectKey で再レンダーしても reload 関数の参照が変わらない", async () => {
  getMilestonesMock.mockResolvedValue(
    Result.ok({ milestones: [], usageCounts: {} }),
  );
  const first = await mount("proj-1");
  const firstReload = first?.reload;
  const second = await rerender("proj-1");
  expect(second?.reload).toBe(firstReload);
});
