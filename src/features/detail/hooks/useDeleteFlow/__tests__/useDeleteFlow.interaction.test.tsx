import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

beforeAll(() => {
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

test("初期 state は { kind: 'idle' }", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("requestDelete() で confirming に遷移", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  act(() => {
    probe.latest.requestDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "confirming" });
});

test("cancelDelete() で idle に戻る", () => {
  const probe = renderHook({ onDelete: vi.fn() });
  act(() => {
    probe.latest.requestDelete();
  });
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("confirmDelete() 成功で deleting → idle、onDelete が呼ばれる", async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("confirmDelete() 失敗で error 状態へ遷移（reason 保持）", async () => {
  const reason = new Error("boom");
  const onDelete = vi.fn().mockRejectedValue(reason);
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "error", reason });
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

test("deleting 中の cancelDelete は machine no-op で吸収（state そのまま）", async () => {
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
  expect(probe.latest.state).toEqual({ kind: "deleting" });
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "deleting" });
  await act(async () => {
    resolve();
    await pending;
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
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
  expect(probe.latest.state).toEqual({ kind: "deleting" });
  let pending2: Promise<void> | undefined;
  act(() => {
    pending2 = probe.latest.confirmDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "deleting" });
  await act(async () => {
    for (const r of resolvers) r();
    await pending;
    await pending2;
  });
});

test("idle 中の confirmDelete 再呼び出しは machine no-op で吸収", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const probe = renderHook({ onDelete });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
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
  expect(probe.latest.state).toEqual({ kind: "idle" });
});

test("error 状態から cancelDelete で idle に戻る", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("x"));
  const probe = renderHook({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.state.kind).toBe("error");
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.state).toEqual({ kind: "idle" });
});
