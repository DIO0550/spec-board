import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { Task } from "@/types/task";
import type { Result } from "@/utils/result";
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

test("同一 act 内で addLink を 2 度連続呼出しても onAddLink は 1 度しか呼ばれない", async () => {
  const onAddLink = vi.fn(() => new Promise<Result<Task, unknown>>(() => {}));
  const probe = renderHook({ onAddLink });

  await act(async () => {
    void probe.latest.addLink("tasks/a.md");
    void probe.latest.addLink("tasks/b.md");
  });

  expect(onAddLink).toHaveBeenCalledTimes(1);
  expect(onAddLink).toHaveBeenCalledWith("tasks/a.md");
});
