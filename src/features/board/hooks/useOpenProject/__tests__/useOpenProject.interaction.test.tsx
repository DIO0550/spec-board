import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { type OpenProjectPayload, openProject, TauriError } from "@/lib/tauri";
import { Result } from "@/utils/result";
import {
  type UseOpenProjectOptions,
  type UseOpenProjectResult,
  useOpenProject,
} from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    openProject: vi.fn(),
  };
});

const openProjectMock = vi.mocked(openProject);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;
let hadIsReactActEnvironment = false;

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
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  openProjectMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

/**
 * useOpenProject の戻り値を観測する Probe コンポーネント。
 * @param props hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseOpenProjectOptions & {
    onResult: (r: UseOpenProjectResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useOpenProject(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントして latest accessor を返すヘルパ。
 * @param args useOpenProject の引数
 * @returns latest accessor
 */
const renderHook = (args: UseOpenProjectOptions) => {
  let latest: UseOpenProjectResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        ...args,
        onResult: (r) => {
          latest = r;
        },
      }),
    );
  });
  return {
    get latest(): UseOpenProjectResult {
      return latest as UseOpenProjectResult;
    },
  };
};

const payloadA: OpenProjectPayload = {
  tasks: [],
  columns: ["TODO"],
};
const payloadB: OpenProjectPayload = {
  tasks: [],
  columns: ["DONE"],
};

test("初期 state は { kind: 'idle' }", () => {
  openProjectMock.mockResolvedValue(Result.ok(payloadA));
  const probe = renderHook({ onError: vi.fn() });
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("open(path) を呼ぶと state は { kind: 'loading', path }", async () => {
  let resolve!: (r: Result<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValue(
    new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
      resolve = r;
    }),
  );
  const probe = renderHook({ onError: vi.fn() });

  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.open("/a");
  });
  expect(probe.latest.state).toEqual({ kind: "loading", path: "/a" });

  await act(async () => {
    resolve(Result.ok(payloadA));
    await pending;
  });
});

test("成功時 { kind: 'loaded', path, data } / onError 未呼び出し", async () => {
  openProjectMock.mockResolvedValue(Result.ok(payloadA));
  const onError = vi.fn();
  const probe = renderHook({ onError });

  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.open("/a");
  });
  await act(async () => {
    await pending;
  });

  expect(probe.latest.state).toEqual({
    kind: "loaded",
    path: "/a",
    data: payloadA,
  });
  expect(onError).toHaveBeenCalledTimes(0);
});

test("失敗時 { kind: 'error', path, error } / onError(error) で 1 回", async () => {
  const error = new TauriError("NOT_FOUND", "nope");
  openProjectMock.mockResolvedValue(Result.err(error));
  const onError = vi.fn();
  const probe = renderHook({ onError });

  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.open("/a");
  });
  await act(async () => {
    await pending;
  });

  expect(probe.latest.state).toEqual({ kind: "error", path: "/a", error });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onError).toHaveBeenCalledWith(error);
});

test("error 状態から open(other) で loading{other}", async () => {
  const firstError = new TauriError("UNKNOWN", "boom");
  openProjectMock.mockResolvedValueOnce(Result.err(firstError));

  let resolveB!: (r: Result<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockImplementationOnce(
    () =>
      new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
        resolveB = r;
      }),
  );

  const onError = vi.fn();
  const probe = renderHook({ onError });

  let pendingA!: Promise<void>;
  act(() => {
    pendingA = probe.latest.open("/a");
  });
  await act(async () => {
    await pendingA;
  });
  expect(probe.latest.state.kind).toBe("error");

  let pendingB!: Promise<void>;
  act(() => {
    pendingB = probe.latest.open("/b");
  });
  expect(probe.latest.state).toEqual({ kind: "loading", path: "/b" });

  await act(async () => {
    resolveB(Result.ok(payloadB));
    await pendingB;
  });
});

test("loaded 状態から open(other) で loading{other}", async () => {
  openProjectMock.mockResolvedValueOnce(Result.ok(payloadA));

  let resolveB!: (r: Result<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockImplementationOnce(
    () =>
      new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
        resolveB = r;
      }),
  );

  const probe = renderHook({ onError: vi.fn() });

  let pendingA!: Promise<void>;
  act(() => {
    pendingA = probe.latest.open("/a");
  });
  await act(async () => {
    await pendingA;
  });
  expect(probe.latest.state.kind).toBe("loaded");

  let pendingB!: Promise<void>;
  act(() => {
    pendingB = probe.latest.open("/b");
  });
  expect(probe.latest.state).toEqual({ kind: "loading", path: "/b" });

  await act(async () => {
    resolveB(Result.ok(payloadB));
    await pendingB;
  });
});

test("reset() で idle に戻る（loading 中の reset でも in-flight resolve が idle を上書きしない）", async () => {
  let resolve!: (r: Result<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValue(
    new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
      resolve = r;
    }),
  );

  const onError = vi.fn();
  const probe = renderHook({ onError });

  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.open("/a");
  });
  expect(probe.latest.state.kind).toBe("loading");

  act(() => {
    probe.latest.reset();
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });

  await act(async () => {
    resolve(Result.ok(payloadA));
    await pending;
  });

  expect(probe.latest.state).toEqual({ kind: "idle" });
  expect(onError).toHaveBeenCalledTimes(0);
});

test("連続 open(a) → open(b) で a の resolve は state に反映されない（後勝ち）", async () => {
  let resolveA!: (r: Result<OpenProjectPayload, TauriError>) => void;
  let resolveB!: (r: Result<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockImplementationOnce(
    () =>
      new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
        resolveA = r;
      }),
  );
  openProjectMock.mockImplementationOnce(
    () =>
      new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
        resolveB = r;
      }),
  );

  const onError = vi.fn();
  const probe = renderHook({ onError });

  let pendingA!: Promise<void>;
  act(() => {
    pendingA = probe.latest.open("/a");
  });
  let pendingB!: Promise<void>;
  act(() => {
    pendingB = probe.latest.open("/b");
  });

  await act(async () => {
    resolveB(Result.ok(payloadB));
    await pendingB;
  });
  await act(async () => {
    resolveA(Result.ok(payloadA));
    await pendingA;
  });

  expect(probe.latest.state).toEqual({
    kind: "loaded",
    path: "/b",
    data: payloadB,
  });
  expect(onError).toHaveBeenCalledTimes(0);
});

test("アンマウント後の resolve で dispatch / onError が発火しない", async () => {
  let resolve!: (r: Result<OpenProjectPayload, TauriError>) => void;
  openProjectMock.mockReturnValue(
    new Promise<Result<OpenProjectPayload, TauriError>>((r) => {
      resolve = r;
    }),
  );

  const onError = vi.fn();
  const probe = renderHook({ onError });

  let pending!: Promise<void>;
  act(() => {
    pending = probe.latest.open("/a");
  });

  act(() => {
    root?.unmount();
    root = null;
  });

  await act(async () => {
    resolve(Result.err(new TauriError("UNKNOWN", "after-unmount")));
    await pending;
  });

  expect(onError).toHaveBeenCalledTimes(0);
});
