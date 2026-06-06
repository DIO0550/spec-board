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

type Deferred = {
  promise: Promise<Awaited<ReturnType<typeof getMilestones>>>;
  resolve: (value: Awaited<ReturnType<typeof getMilestones>>) => void;
};

const makeDeferred = (): Deferred => {
  let resolve: Deferred["resolve"] = () => {};
  const promise = new Promise<Awaited<ReturnType<typeof getMilestones>>>(
    (r) => {
      resolve = r;
    },
  );
  return { promise, resolve };
};

test("同一 projectKey で初回ロードと reload が競合しても古い応答は新しい結果を上書きしない", async () => {
  const deferreds: Deferred[] = [];
  getMilestonesMock.mockImplementation(() => {
    const deferred = makeDeferred();
    deferreds.push(deferred);
    return deferred.promise;
  });

  // 初回ロード（pending のまま）。
  const latest = await mount("proj-1");
  expect(latest?.status).toBe("loading");

  // reload を重ねて 2 本目のリクエストを開始（こちらも pending）。
  await act(async () => {
    void latest?.reload();
    await Promise.resolve();
  });
  expect(deferreds.length).toBe(2);

  // 後発（reload）を先に解決 → 新しい一覧が確定する。
  await act(async () => {
    deferreds[1].resolve(
      Result.ok({ milestones: [{ name: "new" }], usageCounts: { new: 1 } }),
    );
    await Promise.resolve();
  });

  // 先発（初回）が後から解決しても、古い世代なので破棄される。
  await act(async () => {
    deferreds[0].resolve(
      Result.ok({ milestones: [{ name: "old" }], usageCounts: { old: 9 } }),
    );
    await Promise.resolve();
  });

  expect(captured.current?.milestones).toEqual([{ name: "new" }]);
  expect(captured.current?.usageCounts).toEqual({ new: 1 });
});
