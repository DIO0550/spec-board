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
import { LabelDefinition } from "@/domains/label-definition";
import {
  type UseLabelMutationsResult,
  useLabelMutations,
} from "@/features/settings/hooks/useLabelMutations";
import { createLabel, deleteLabel, TauriError } from "@/lib/tauri";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
  };
});

const createMock = vi.mocked(createLabel);
const deleteMock = vi.mocked(deleteLabel);

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
  onResult: (result: UseLabelMutationsResult) => void;
}) => {
  const result = useLabelMutations(reload);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const mount = async (
  reload: () => Promise<void>,
): Promise<{ get latest(): UseLabelMutationsResult }> => {
  let latest: UseLabelMutationsResult | null = null;
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
  return {
    get latest(): UseLabelMutationsResult {
      return latest as UseLabelMutationsResult;
    },
  };
};

test("create 成功時に reload を呼ぶ", async () => {
  createMock.mockResolvedValue(Result.ok(undefined));
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);
  await act(async () => {
    await probe.latest.create({ name: "needs-design" });
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("create 失敗時は reload を呼ばず false を返す", async () => {
  createMock.mockResolvedValue(Result.err(TauriError.from("失敗")));
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);
  await act(async () => {
    const ok = await probe.latest.create({ name: "dup" });
    expect(ok).toBe(false);
  });
  expect(reload).not.toHaveBeenCalled();
});

test("remove 成功時に reload を呼び usageCount payload を返す", async () => {
  deleteMock.mockResolvedValue(Result.ok({ usageCount: 5 }));
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);
  await act(async () => {
    const payload = await probe.latest.remove(
      LabelDefinition.fromWire({ name: "bug" }).name,
    );
    expect(payload).toEqual({ usageCount: 5 });
  });
  expect(reload).toHaveBeenCalledTimes(1);
});

test("remove 失敗時は reload を呼ばず null を返す", async () => {
  deleteMock.mockResolvedValue(Result.err(TauriError.from("失敗")));
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);
  await act(async () => {
    const payload = await probe.latest.remove(
      LabelDefinition.fromWire({ name: "bug" }).name,
    );
    expect(payload).toBeNull();
  });
  expect(reload).not.toHaveBeenCalled();
});

test("create 実行中は isPending=true、完了で false に戻る", async () => {
  let resolveCb: ((r: Result<undefined, TauriError>) => void) | null = null;
  createMock.mockReturnValue(
    new Promise<Result<undefined, TauriError>>((resolve) => {
      resolveCb = resolve;
    }),
  );
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);

  let createPromise: Promise<boolean> = Promise.resolve(false);
  act(() => {
    createPromise = probe.latest.create({ name: "x" });
  });
  expect(probe.latest.isPending).toBe(true);

  await act(async () => {
    resolveCb?.(Result.ok(undefined));
    await createPromise;
  });
  expect(probe.latest.isPending).toBe(false);
});

test("実行中の create 連打は 2 回目を短絡し IPC を二重発行しない", async () => {
  let resolveCb: ((r: Result<undefined, TauriError>) => void) | null = null;
  createMock.mockReturnValue(
    new Promise<Result<undefined, TauriError>>((resolve) => {
      resolveCb = resolve;
    }),
  );
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);

  let firstPromise: Promise<boolean> = Promise.resolve(false);
  act(() => {
    firstPromise = probe.latest.create({ name: "x" });
  });
  let secondResult: boolean | undefined;
  await act(async () => {
    secondResult = await probe.latest.create({ name: "x" });
  });

  expect(createMock).toHaveBeenCalledTimes(1);
  expect(secondResult).toBe(false);

  await act(async () => {
    resolveCb?.(Result.ok(undefined));
    await firstPromise;
  });
});

test("実行中は他種別の mutation も短絡する（create 中の remove）", async () => {
  let resolveCb: ((r: Result<undefined, TauriError>) => void) | null = null;
  createMock.mockReturnValue(
    new Promise<Result<undefined, TauriError>>((resolve) => {
      resolveCb = resolve;
    }),
  );
  const reload = vi.fn(async () => {});
  const probe = await mount(reload);

  let firstPromise: Promise<boolean> = Promise.resolve(false);
  act(() => {
    firstPromise = probe.latest.create({ name: "x" });
  });
  let removeResult: unknown;
  await act(async () => {
    removeResult = await probe.latest.remove(
      LabelDefinition.fromWire({ name: "y" }).name,
    );
  });

  expect(deleteMock).not.toHaveBeenCalled();
  expect(removeResult).toBeNull();

  await act(async () => {
    resolveCb?.(Result.ok(undefined));
    await firstPromise;
  });
});
