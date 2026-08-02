import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { previewTaskMarkdown } from "@/lib/tauri";
import type { PreviewTaskMarkdownParams } from "@/lib/tauri/taskCommands/types";
import { TauriError } from "@/lib/tauri/tauriError";
import { Result } from "@/utils/result";
import { type PreviewMarkdownState, usePreviewTaskMarkdown } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    previewTaskMarkdown: vi.fn(),
  };
});

const mockPreview = vi.mocked(previewTaskMarkdown);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const PARAMS: PreviewTaskMarkdownParams = {
  title: "Task",
  status: "Todo",
  priority: undefined,
  labels: [],
  parent: undefined,
  links: [],
  due: undefined,
  draft: false,
  body: "",
};

const Probe = ({
  params,
  onState,
}: {
  params: PreviewTaskMarkdownParams;
  onState: (state: PreviewMarkdownState) => void;
}) => {
  const state = usePreviewTaskMarkdown(params);
  useEffect(() => {
    onState(state);
  });
  return null;
};

const mount = async (
  params: PreviewTaskMarkdownParams,
  onState: (state: PreviewMarkdownState) => void,
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe, { params, onState }));
  });
};

beforeEach(() => {
  mockPreview.mockReset();
});

test("初期レンダリングでは pending を返す", () => {
  mockPreview.mockImplementation(() => new Promise(() => {}));
  const states: PreviewMarkdownState[] = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(Probe, {
        params: PARAMS,
        onState: (state) => states.push(state),
      }),
    );
  });
  expect(states[0]).toEqual({ kind: "pending", markdown: null, error: null });
});

test("IPC 成功後に full markdown を返す", async () => {
  mockPreview.mockResolvedValue(Result.ok("---\ntitle: Task\n---\n本文"));
  const states: PreviewMarkdownState[] = [];
  await mount(PARAMS, (state) => states.push(state));
  expect(states[states.length - 1]).toEqual({
    kind: "ready",
    markdown: "---\ntitle: Task\n---\n本文",
    error: null,
  });
});

test("IPC エラー時は古い markdown に fallback せず error state にする", async () => {
  mockPreview.mockResolvedValueOnce(Result.ok("---\ntitle: First\n---\n本文"));
  const states: PreviewMarkdownState[] = [];
  await mount(PARAMS, (state) => states.push(state));

  mockPreview.mockResolvedValueOnce(
    Result.err(new TauriError("PARSE_ERROR", "preview failed")),
  );
  await act(async () => {
    root?.render(
      createElement(Probe, {
        params: { ...PARAMS, title: "Second" },
        onState: (state) => states.push(state),
      }),
    );
    await Promise.resolve();
  });

  expect(states[states.length - 1]).toMatchObject({
    kind: "error",
    markdown: null,
    error: { message: "preview failed" },
  });
});

test("高速入力で stale な成功応答を破棄する", async () => {
  type OkMarkdown = ReturnType<typeof Result.ok<string>>;
  const deferred: { resolve: ((result: OkMarkdown) => void) | null } = {
    resolve: null,
  };
  const firstPromise = new Promise<OkMarkdown>((resolve) => {
    deferred.resolve = resolve;
  });
  mockPreview.mockReturnValueOnce(firstPromise as never);
  const states: PreviewMarkdownState[] = [];
  await mount(PARAMS, (state) => states.push(state));

  mockPreview.mockResolvedValueOnce(Result.ok("---\ntitle: Second\n---\n本文"));
  await act(async () => {
    root?.render(
      createElement(Probe, {
        params: { ...PARAMS, title: "Second" },
        onState: (state) => states.push(state),
      }),
    );
    await Promise.resolve();
  });

  deferred.resolve?.(Result.ok("---\ntitle: First\n---\n本文"));
  await act(async () => {
    await Promise.resolve();
  });

  expect(states[states.length - 1]).toMatchObject({
    kind: "ready",
    markdown: "---\ntitle: Second\n---\n本文",
  });
});
