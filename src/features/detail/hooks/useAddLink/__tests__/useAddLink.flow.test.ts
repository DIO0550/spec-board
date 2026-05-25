import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import { type UseAddLinkArgs, type UseAddLinkResult, useAddLink } from "..";

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

const Probe = (
  props: UseAddLinkArgs & { onResult: (r: UseAddLinkResult) => void },
) => {
  const result = useAddLink({ onAddLink: props.onAddLink });
  useEffect(() => {
    props.onResult(result);
  });
  return null;
};

const renderHook = (args: UseAddLinkArgs) => {
  let latest: UseAddLinkResult | null = null;
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
    get latest(): UseAddLinkResult {
      return latest as UseAddLinkResult;
    },
  };
};

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

test("addLink 開始で isBusy=true、resolve で isBusy=false に戻る", async () => {
  let resolveCb: ((r: Result<Task, unknown>) => void) | null = null;
  const onAddLink = vi.fn(
    () =>
      new Promise<Result<Task, unknown>>((resolve) => {
        resolveCb = resolve;
      }),
  );
  const probe = renderHook({ onAddLink });

  let addPromise: Promise<void> = Promise.resolve();
  act(() => {
    addPromise = probe.latest.addLink("tasks/b.md");
  });
  expect(probe.latest.isBusy).toBe(true);

  await act(async () => {
    resolveCb?.(Result.ok(stubTask()));
    await addPromise;
  });
  expect(probe.latest.isBusy).toBe(false);
});

test("Result.err でも finally で isBusy=false に戻る", async () => {
  const onAddLink = vi.fn(async () => Result.err(new Error("fail")));
  const probe = renderHook({ onAddLink });

  await act(async () => {
    await probe.latest.addLink("tasks/b.md");
  });

  expect(probe.latest.isBusy).toBe(false);
});

test("onAddLink が throw しても finally で isBusy=false に戻る", async () => {
  const onAddLink = vi.fn(async () => {
    throw new Error("boom");
  });
  const probe = renderHook({ onAddLink });

  await act(async () => {
    await probe.latest.addLink("tasks/b.md").catch(() => undefined);
  });

  expect(probe.latest.isBusy).toBe(false);
});
