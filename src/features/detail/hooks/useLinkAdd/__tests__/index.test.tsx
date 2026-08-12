import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type LinkAddCallback,
  type UseLinkAddOptions,
  useLinkAdd,
} from "@/features/detail/hooks/useLinkAdd";
import {
  PROJECT_SWITCHED_MESSAGE,
  ProjectError,
} from "@/providers/ProjectProvider";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";

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
}: UseLinkAddOptions & { onResult: (callback: LinkAddCallback) => void }) => {
  const callback = useLinkAdd(hookOptions);
  useEffect(() => onResult(callback));
  return null;
};
const renderHook = (hookOptions: UseLinkAddOptions): LinkAddCallback => {
  let latest: LinkAddCallback | null = null;
  container = document.createElement("div");
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        ...hookOptions,
        onResult: (value) => {
          latest = value;
        },
      }),
    ),
  );
  return (...args) => (latest as LinkAddCallback)(...args);
};

test("link add成功のResultを透過してannounceする", async () => {
  const result = Result.ok(source);
  const announce = vi.fn();
  const callback = renderHook({
    tasks: [source, target],
    addLink: vi.fn().mockResolvedValue(result),
    announce,
    onError: vi.fn(),
  });
  let actual: Awaited<ReturnType<LinkAddCallback>> | undefined;
  await act(async () => {
    actual = await callback(source.filePath, target.filePath);
  });
  expect(actual).toBe(result);
  expect(announce).toHaveBeenCalledWith("「A」に「B」をリンクしました");
});

test("link add失敗はonErrorとrollbackを通知する", async () => {
  const error = ProjectError.invalidState("失敗");
  const result = Result.err(error);
  const onError = vi.fn();
  const announce = vi.fn();
  const callback = renderHook({
    tasks: [source, target],
    addLink: vi.fn().mockResolvedValue(result),
    announce,
    onError,
  });
  expect(await callback(source.filePath, target.filePath)).toBe(result);
  expect(onError).toHaveBeenCalledWith(
    error,
    "リンクの追加に失敗しました: 失敗",
  );
  expect(announce).toHaveBeenCalledWith(
    "「A」への「B」のリンク追加を取り消しました",
  );
});

test("link addのproject switchは通知を抑止してResultを透過する", async () => {
  const result = Result.err(
    ProjectError.invalidState(PROJECT_SWITCHED_MESSAGE),
  );
  const onError = vi.fn();
  const announce = vi.fn();
  const callback = renderHook({
    tasks: [source, target],
    addLink: vi.fn().mockResolvedValue(result),
    announce,
    onError,
  });
  expect(await callback(source.filePath, target.filePath)).toBe(result);
  expect(onError).not.toHaveBeenCalled();
  expect(announce).not.toHaveBeenCalled();
});

test("link addはtitle不明時にfilePathを使う", async () => {
  const announce = vi.fn();
  const callback = renderHook({
    tasks: [],
    addLink: vi.fn().mockResolvedValue(Result.ok(source)),
    announce,
    onError: vi.fn(),
  });
  await callback("a.md", "b.md");
  expect(announce).toHaveBeenCalledWith("「a.md」に「b.md」をリンクしました");
});
