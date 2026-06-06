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
import {
  type UseMilestoneMutationsResult,
  useMilestoneMutations,
} from "@/features/settings/hooks/useMilestoneMutations";
import { createMilestone, deleteMilestone, TauriError } from "@/lib/tauri";
import { Result } from "@/utils/result";

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

const createMock = vi.mocked(createMilestone);
const deleteMock = vi.mocked(deleteMilestone);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previous: boolean | undefined;

beforeAll(() => {
  previous = reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = previous;
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  createMock.mockReset();
  deleteMock.mockReset();
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
  reload,
  onResult,
}: {
  reload: () => Promise<void>;
  onResult: (result: UseMilestoneMutationsResult) => void;
}) => {
  const result = useMilestoneMutations(reload);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const mount = async (
  reload: () => Promise<void>,
): Promise<UseMilestoneMutationsResult | null> => {
  let latest: UseMilestoneMutationsResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(Probe, {
        reload,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return latest;
};

test("create 成功時に reload を呼ぶ", async () => {
  createMock.mockResolvedValue(Result.ok(undefined));
  const reload = vi.fn(async () => {});
  const mutations = await mount(reload);
  await act(async () => {
    await mutations?.create({ name: "v0.3" });
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("create 失敗時は reload を呼ばない", async () => {
  createMock.mockResolvedValue(Result.err(TauriError.from("失敗")));
  const reload = vi.fn(async () => {});
  const mutations = await mount(reload);
  await act(async () => {
    const ok = await mutations?.create({ name: "v0.3" });
    expect(ok).toBe(false);
  });
  expect(reload).not.toHaveBeenCalled();
});

test("remove 成功時に reload を呼び usageCount payload を返す", async () => {
  deleteMock.mockResolvedValue(Result.ok({ usageCount: 2 }));
  const reload = vi.fn(async () => {});
  const mutations = await mount(reload);
  await act(async () => {
    const payload = await mutations?.remove("v0.3");
    expect(payload).toEqual({ usageCount: 2 });
  });
  expect(reload).toHaveBeenCalledTimes(1);
});
