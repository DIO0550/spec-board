import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import {
  type UseRemoveLinkArgs,
  type UseRemoveLinkResult,
  useRemoveLink,
} from "..";

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
 * Hook の戻り値を観測する probe コンポーネント。
 * @param props onRemoveLink と onResult callback
 */
const Probe = (
  props: UseRemoveLinkArgs & { onResult: (r: UseRemoveLinkResult) => void },
) => {
  const result = useRemoveLink({ onRemoveLink: props.onRemoveLink });
  useEffect(() => {
    props.onResult(result);
  });
  return null;
};

/**
 * Probe を render して最新の hook 戻り値を取り出す。
 * @param args useRemoveLink への入力
 * @returns latest accessor
 */
const renderHook = (args: UseRemoveLinkArgs) => {
  let latest: UseRemoveLinkResult | null = null;
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
    get latest(): UseRemoveLinkResult {
      return latest as UseRemoveLinkResult;
    },
  };
};

/**
 * canonical 戻り値用の Task stub。
 * @returns Task
 */
const stubTask = (): Task =>
  Task.fromPayload({
    id: "tasks/a.md",
    title: "A",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/a.md",
    extras: {},
    warnings: [],
  });

test("removeLink 開始で isBusy=true、resolve で isBusy=false に戻る", async () => {
  let resolveCb: ((r: Result<Task, unknown>) => void) | null = null;
  const onRemoveLink = vi.fn(
    () =>
      new Promise<Result<Task, unknown>>((resolve) => {
        resolveCb = resolve;
      }),
  );
  const probe = renderHook({ onRemoveLink });

  let removePromise: Promise<void> = Promise.resolve();
  act(() => {
    removePromise = probe.latest.removeLink("tasks/b.md");
  });
  expect(probe.latest.isBusy).toBe(true);

  await act(async () => {
    resolveCb?.(Result.ok(stubTask()));
    await removePromise;
  });
  expect(probe.latest.isBusy).toBe(false);
});

test("Result.err でも finally で isBusy=false に戻る", async () => {
  const onRemoveLink = vi.fn(async () => Result.err(new Error("fail")));
  const probe = renderHook({ onRemoveLink });

  await act(async () => {
    await probe.latest.removeLink("tasks/b.md");
  });

  expect(probe.latest.isBusy).toBe(false);
});

test("onRemoveLink が throw しても finally で isBusy=false に戻る", async () => {
  const onRemoveLink = vi.fn(async () => {
    throw new Error("boom");
  });
  const probe = renderHook({ onRemoveLink });

  await act(async () => {
    await probe.latest.removeLink("tasks/b.md").catch(() => undefined);
  });

  expect(probe.latest.isBusy).toBe(false);
});
