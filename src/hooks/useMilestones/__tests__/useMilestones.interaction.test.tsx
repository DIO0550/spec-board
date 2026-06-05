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
import { getMilestones, TauriError } from "@/lib/tauri";
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

const captured: { current: MilestonesResource | null } = { current: null };

const capture = (r: MilestonesResource): void => {
  captured.current = r;
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

test("projectKey が undefined のとき getMilestones を呼ばず idle になる", async () => {
  const latest = await mount(undefined);
  expect(getMilestonesMock).not.toHaveBeenCalled();
  expect(latest?.status).toBe("idle");
  expect(latest?.milestones).toEqual([]);
});

test("初回取得で loaded になり milestones / usageCounts / byName を保持する", async () => {
  getMilestonesMock.mockResolvedValue(
    Result.ok({
      milestones: [{ name: "v0.3", title: "v0.3 リリース" }],
      usageCounts: { "v0.3": 2 },
    }),
  );
  const latest = await mount("proj-1");
  expect(latest?.status).toBe("loaded");
  expect(latest?.usageCounts).toEqual({ "v0.3": 2 });
  expect(latest?.byName.get("v0.3")?.title).toBe("v0.3 リリース");
});

test("projectKey が変わると再取得する", async () => {
  getMilestonesMock.mockResolvedValue(
    Result.ok({ milestones: [], usageCounts: {} }),
  );
  await mount("proj-1");
  expect(getMilestonesMock).toHaveBeenCalledTimes(1);
  await rerender("proj-2");
  expect(getMilestonesMock).toHaveBeenCalledTimes(2);
});

test("reload() で再取得する", async () => {
  getMilestonesMock.mockResolvedValue(
    Result.ok({ milestones: [], usageCounts: {} }),
  );
  const latest = await mount("proj-1");
  expect(getMilestonesMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await latest?.reload();
  });
  expect(getMilestonesMock).toHaveBeenCalledTimes(2);
});

test("getMilestones が err を返すと status が error になる", async () => {
  getMilestonesMock.mockResolvedValue(Result.err(TauriError.from("取得失敗")));
  const latest = await mount("proj-1");
  expect(latest?.status).toBe("error");
  expect(latest?.error).toBe("取得失敗");
});
