import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

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
  // 元々プロパティが存在しなかった場合のみ delete してプロパティ自体を消す。
  // 存在していた場合は値の復元のみで足りる（条件分岐は配列で表現してテスト規約を満たす）。
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

import {
  type UseDeleteFlowArgs,
  type UseDeleteFlowResult,
  useDeleteFlow,
} from "../index";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

/**
 * useDeleteFlow の戻り値を観測する Probe。
 * @param props - hook 引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseDeleteFlowArgs & {
    onResult: (r: UseDeleteFlowResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useDeleteFlow(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントする。
 * @param args - useDeleteFlow の引数
 * @returns latest accessor
 */
const renderHook = (args: UseDeleteFlowArgs) => {
  let latest: UseDeleteFlowResult | null = null;
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
    get latest(): UseDeleteFlowResult {
      return latest as UseDeleteFlowResult;
    },
  };
};

test("初期状態は閉じている（isOpen=false / isBusy=false）", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  expect(probe.latest.isOpen).toBe(false);
  expect(probe.latest.isBusy).toBe(false);
});

test("confirming では isOpen=true / isBusy=false", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  act(() => {
    probe.latest.requestDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  expect(probe.latest.isBusy).toBe(false);
});

test("deleting では isOpen=true / isBusy=true", async () => {
  let resolve!: () => void;
  const onDelete = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  expect(probe.latest.isBusy).toBe(true);
  await act(async () => {
    resolve();
    await pending;
  });
});

test("error では isOpen=true / isBusy=false", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("x"));
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  expect(probe.latest.isBusy).toBe(false);
});

test("requestDelete() で確認ダイアログが開く（isOpen=true）", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  act(() => {
    probe.latest.requestDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  expect(probe.latest.isBusy).toBe(false);
});

test("cancelDelete() で閉じる（isOpen=false）", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  act(() => {
    probe.latest.requestDelete();
  });
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.isOpen).toBe(false);
});

test("confirmDelete() 成功で閉じる（isOpen=false）、onDelete が呼ばれる", async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(probe.latest.isOpen).toBe(false);
});

test("confirmDelete() 失敗でダイアログは開いたまま（isOpen=true / isBusy=false）", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("boom"));
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  expect(probe.latest.isBusy).toBe(false);
});

test("削除失敗時に console.error / warn / log が呼ばれない", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const onDelete = vi.fn().mockRejectedValue(new Error("x"));
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();
  expect(logSpy).not.toHaveBeenCalled();
});

test("deleting 中の cancelDelete は machine no-op で吸収（busy のまま）", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let resolve!: () => void;
  const onDelete = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = probe.latest.confirmDelete();
  });
  expect(probe.latest.isBusy).toBe(true);
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.isBusy).toBe(true);
  await act(async () => {
    resolve();
    await pending;
  });
  expect(probe.latest.isOpen).toBe(false);
});

test("deleting 中の confirmDelete 再呼び出しは machine no-op で吸収", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const resolvers: Array<() => void> = [];
  const onDelete = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolvers.push(r);
      }),
  );
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = probe.latest.confirmDelete();
  });
  expect(probe.latest.isBusy).toBe(true);
  let pending2: Promise<void> | undefined;
  act(() => {
    pending2 = probe.latest.confirmDelete();
  });
  expect(probe.latest.isBusy).toBe(true);
  await act(async () => {
    for (const r of resolvers) {
      r();
    }
    await pending;
    await pending2;
  });
});

test("閉じている状態での confirmDelete 再呼び出しは machine no-op で吸収", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const probe = renderHook({ onDelete });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(false);
});

test("同期的な onDelete でも動作する", async () => {
  const onDelete = vi.fn(() => undefined);
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(probe.latest.isOpen).toBe(false);
});

test("error 状態から cancelDelete で閉じる（isOpen=false）", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("x"));
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.isOpen).toBe(false);
});
