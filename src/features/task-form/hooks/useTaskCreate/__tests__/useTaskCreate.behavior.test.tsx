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
  const keysToDelete = hadIsReactActEnvironment
    ? []
    : (["IS_REACT_ACT_ENVIRONMENT"] as const);
  for (const key of keysToDelete) {
    Reflect.deleteProperty(reactActEnvironmentGlobal, key);
  }
});

import { ProjectError } from "@/features/board";
import type { TaskFormValues } from "@/features/task-form/types";
import { TauriError } from "@/lib/tauri";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import {
  type UseTaskCreateOptions,
  type UseTaskCreateResult,
  useTaskCreate,
} from "../index";

const taskFixture = Task.fromPayload({
  id: "task-1",
  title: "fixture",
  status: "TODO",
  labels: [],
  body: "",
  filePath: "/proj/tasks/task-1.md",
  links: [],
  children: [],
  reverseLinks: [],
});

const valuesFixture: TaskFormValues = {
  title: "fixture",
  status: "TODO",
  labels: [],
  links: [],
  body: "",
};

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
 * useTaskCreate の戻り値を観測する Probe。
 * @param props フック引数 + 観測コールバック
 * @returns null
 */
const Probe = (
  props: UseTaskCreateOptions & {
    onResult: (r: UseTaskCreateResult) => void;
  },
) => {
  const { onResult, ...args } = props;
  const result = useTaskCreate(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、最新戻り値にアクセスする accessor を返す。
 * @param args useTaskCreate の引数
 * @returns latest accessor
 */
const renderHook = (args: UseTaskCreateOptions) => {
  let latest: UseTaskCreateResult | null = null;
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
    get latest(): UseTaskCreateResult {
      return latest as UseTaskCreateResult;
    },
  };
};

test("T1: 初期 state は isSubmitting=false で submit が関数である", () => {
  const probe = renderHook({ createTask: vi.fn() });
  expect(probe.latest.isSubmitting).toBe(false);
  expect(typeof probe.latest.submit).toBe("function");
});

test("T2: 成功時に Result.ok が pass-through され、isSubmitting が true→false で遷移する", async () => {
  let resolveCreate!: (
    r: Awaited<ReturnType<UseTaskCreateOptions["createTask"]>>,
  ) => void;
  const createTask = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<UseTaskCreateOptions["createTask"]>>>(
        (r) => {
          resolveCreate = r;
        },
      ),
  );
  const probe = renderHook({ createTask });

  let pending!: ReturnType<UseTaskCreateResult["submit"]>;
  act(() => {
    pending = probe.latest.submit(valuesFixture);
  });
  expect(probe.latest.isSubmitting).toBe(true);

  await act(async () => {
    resolveCreate(Result.ok(taskFixture));
    await pending;
  });
  expect(probe.latest.isSubmitting).toBe(false);
  const result = await pending;
  expect(result).toEqual(Result.ok(taskFixture));
});

test("T5: 送信中の再 submit は invalid-state で短絡し、createTask は 1 回しか呼ばれない", async () => {
  let resolveCreate!: (
    r: Awaited<ReturnType<UseTaskCreateOptions["createTask"]>>,
  ) => void;
  const createTask = vi.fn(
    () =>
      new Promise<Awaited<ReturnType<UseTaskCreateOptions["createTask"]>>>(
        (r) => {
          resolveCreate = r;
        },
      ),
  );
  const probe = renderHook({ createTask });

  let first!: ReturnType<UseTaskCreateResult["submit"]>;
  act(() => {
    first = probe.latest.submit(valuesFixture);
  });
  expect(probe.latest.isSubmitting).toBe(true);

  let second!: Awaited<ReturnType<UseTaskCreateResult["submit"]>>;
  await act(async () => {
    second = await probe.latest.submit(valuesFixture);
  });
  expect(second).toEqual(Result.err(ProjectError.invalidState("送信中です")));
  expect(createTask).toHaveBeenCalledTimes(1);

  await act(async () => {
    resolveCreate(Result.ok(taskFixture));
    await first;
  });
});

test("T6: 1 回目完了後の再 submit は再度 createTask を呼んで Result.ok を返す", async () => {
  const createTask = vi.fn().mockResolvedValue(Result.ok(taskFixture));
  const probe = renderHook({ createTask });

  await act(async () => {
    await probe.latest.submit(valuesFixture);
  });
  expect(probe.latest.isSubmitting).toBe(false);

  let second!: Awaited<ReturnType<UseTaskCreateResult["submit"]>>;
  await act(async () => {
    second = await probe.latest.submit(valuesFixture);
  });
  expect(second).toEqual(Result.ok(taskFixture));
  expect(createTask).toHaveBeenCalledTimes(2);
});

test("T4: 失敗時に Result.err が pass-through され、finally で isSubmitting が false に戻る", async () => {
  const tauriErrorFixture = TauriError.from("見つかりません");
  const projectErrorFixture = ProjectError.tauri(tauriErrorFixture);
  const createTask = vi.fn().mockResolvedValue(Result.err(projectErrorFixture));
  const probe = renderHook({ createTask });

  let result!: Awaited<ReturnType<UseTaskCreateResult["submit"]>>;
  await act(async () => {
    result = await probe.latest.submit(valuesFixture);
  });
  expect(result).toEqual(Result.err(projectErrorFixture));
  expect(probe.latest.isSubmitting).toBe(false);
});

test("T7: injected createTask が reject すると submit も reject し、isSubmitting が false に戻る", async () => {
  const boom = new Error("boom");
  const createTask = vi.fn().mockRejectedValueOnce(boom);
  const probe = renderHook({ createTask });

  await act(async () => {
    await expect(probe.latest.submit(valuesFixture)).rejects.toThrow("boom");
  });
  expect(probe.latest.isSubmitting).toBe(false);
});

test("T3: priority / parent が undefined のとき CreateTaskParams から key 自体を含めない", async () => {
  const createTask = vi.fn().mockResolvedValue(Result.ok(taskFixture));
  const probe = renderHook({ createTask });
  const values: TaskFormValues = {
    title: "T",
    status: "TODO",
    labels: [],
    links: [],
    body: "",
  };
  await act(async () => {
    await probe.latest.submit(values);
  });
  expect(createTask).toHaveBeenCalledTimes(1);
  const params = createTask.mock.calls[0][0] as Record<string, unknown>;
  expect(params).toEqual({
    title: "T",
    status: "TODO",
    labels: [],
    links: [],
    body: "",
  });
  expect(params).not.toHaveProperty("priority");
  expect(params).not.toHaveProperty("parent");
});

test("T3b: priority / parent が値を持つときは CreateTaskParams に含まれる", async () => {
  const createTask = vi.fn().mockResolvedValue(Result.ok(taskFixture));
  const probe = renderHook({ createTask });
  const values: TaskFormValues = {
    title: "T",
    status: "TODO",
    priority: "High",
    labels: ["bug"],
    parent: "tasks/parent.md",
    links: ["tasks/related.md"],
    body: "body",
  };
  await act(async () => {
    await probe.latest.submit(values);
  });
  expect(createTask).toHaveBeenCalledWith({
    title: "T",
    status: "TODO",
    priority: "High",
    labels: ["bug"],
    parent: "tasks/parent.md",
    links: ["tasks/related.md"],
    body: "body",
  });
});
