import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  PROJECT_SWITCHED_MESSAGE,
  ProjectError,
} from "@/providers/ProjectProvider";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import {
  type LinkRemoveCallback,
  type UseLinkRemoveOptions,
  useLinkRemove,
} from "@/features/detail/hooks/useLinkRemove";

const source = Task.fromPayload({
  id: "a",
  title: "A",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "a.md",
});
const target = Task.fromPayload({
  id: "b",
  title: "B",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "b.md",
});
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});
const Probe = ({
  onResult,
  ...hookOptions
}: UseLinkRemoveOptions & {
  onResult: (callback: LinkRemoveCallback) => void;
}) => {
  const callback = useLinkRemove(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};

test("link remove成功のResultを透過してannounceする", async () => {
  const result = Result.ok(source);
  const announce = vi.fn();
  let latest: LinkRemoveCallback | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        tasks: [source, target],
        removeLink: vi.fn().mockResolvedValue(result),
        announce,
        onError: vi.fn(),
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  let actual;
  await act(async () => {
    actual = await (latest as unknown as LinkRemoveCallback)(
      source.filePath,
      target.filePath,
    );
  });
  expect(actual).toBe(result);
  expect(announce).toHaveBeenCalledWith(
    "「A」から「B」へのリンクを削除しました",
  );
});

test("link remove失敗はonErrorとrollbackを通知する", async () => {
  const error = ProjectError.invalidState("失敗");
  const result = Result.err(error);
  const onError = vi.fn();
  const announce = vi.fn();
  let latest: LinkRemoveCallback | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        tasks: [source, target],
        removeLink: vi.fn().mockResolvedValue(result),
        announce,
        onError,
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  expect(
    await (latest as unknown as LinkRemoveCallback)(
      source.filePath,
      target.filePath,
    ),
  ).toBe(result);
  expect(onError).toHaveBeenCalledWith(
    error,
    "リンクの削除に失敗しました: 失敗",
  );
  expect(announce).toHaveBeenCalledWith(
    "「A」から「B」へのリンク削除を取り消しました",
  );
});

test("link removeのproject switchは通知を抑止する", async () => {
  const result = Result.err(
    ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE),
  );
  const onError = vi.fn();
  const announce = vi.fn();
  let latest: LinkRemoveCallback | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        tasks: [],
        removeLink: vi.fn().mockResolvedValue(result),
        announce,
        onError,
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  expect(await (latest as unknown as LinkRemoveCallback)("a.md", "b.md")).toBe(
    result,
  );
  expect(onError).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
});
