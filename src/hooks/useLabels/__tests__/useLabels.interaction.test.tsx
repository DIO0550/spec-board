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
import { getLabels, TauriError } from "@/lib/tauri";
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

const captured: { current: LabelsResource | null } = { current: null };

const capture = (r: LabelsResource): void => {
  captured.current = r;
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

test("projectKey が undefined のとき getLabels を呼ばず idle になる", async () => {
  const latest = await mount(undefined);
  expect(getLabelsMock).not.toHaveBeenCalled();
  expect(latest?.status).toBe("idle");
  expect(latest?.labels).toEqual([]);
  expect(latest?.usageCounts).toEqual({});
});

test("初回取得で loaded になり labels / usageCounts / byName を保持する", async () => {
  getLabelsMock.mockResolvedValue(
    Result.ok({
      labels: [{ name: "bug", group: "type" }],
      usageCounts: { bug: 8 },
    }),
  );
  const latest = await mount("proj-1");
  expect(latest?.status).toBe("loaded");
  expect(latest?.usageCounts).toEqual({ bug: 8 });
  expect(latest?.byName.get("bug")?.group).toBe("type");
});

test("projectKey が変わると再取得する", async () => {
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
  await mount("proj-1");
  expect(getLabelsMock).toHaveBeenCalledTimes(1);
  await rerender("proj-2");
  expect(getLabelsMock).toHaveBeenCalledTimes(2);
});

test("reload() で再取得する", async () => {
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [], usageCounts: {} }));
  const latest = await mount("proj-1");
  expect(getLabelsMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await latest?.reload();
  });
  expect(getLabelsMock).toHaveBeenCalledTimes(2);
});

test("getLabels が err を返すと status が error になる", async () => {
  getLabelsMock.mockResolvedValue(Result.err(TauriError.from("取得失敗")));
  const latest = await mount("proj-1");
  expect(latest?.status).toBe("error");
  expect(latest?.error).toBe("取得失敗");
});

type Deferred = {
  promise: Promise<Awaited<ReturnType<typeof getLabels>>>;
  resolve: (value: Awaited<ReturnType<typeof getLabels>>) => void;
};

const makeDeferred = (): Deferred => {
  let resolve: Deferred["resolve"] = () => {};
  const promise = new Promise<Awaited<ReturnType<typeof getLabels>>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("同一 projectKey で初回ロードと reload が競合しても古い応答は新しい結果を上書きしない", async () => {
  const deferreds: Deferred[] = [];
  getLabelsMock.mockImplementation(() => {
    const deferred = makeDeferred();
    deferreds.push(deferred);
    return deferred.promise;
  });

  const latest = await mount("proj-1");
  expect(latest?.status).toBe("loading");

  await act(async () => {
    void latest?.reload();
    await Promise.resolve();
  });
  expect(deferreds.length).toBe(2);

  await act(async () => {
    deferreds[1].resolve(
      Result.ok({ labels: [{ name: "new" }], usageCounts: { new: 1 } }),
    );
    await Promise.resolve();
  });

  await act(async () => {
    deferreds[0].resolve(
      Result.ok({ labels: [{ name: "old" }], usageCounts: { old: 9 } }),
    );
    await Promise.resolve();
  });

  expect(captured.current?.labels).toEqual([{ name: "new" }]);
  expect(captured.current?.usageCounts).toEqual({ new: 1 });
});
