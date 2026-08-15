import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";
import { previewTaskFilename } from "@/lib/tauri";
import type { PreviewTaskFilenamePayload } from "@/lib/tauri/taskCommands/types";
import { Result } from "@/utils/result";
import { type UsePreviewTaskFilenameArgs, usePreviewTaskFilename } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    previewTaskFilename: vi.fn(),
  };
});

const mockPreview = vi.mocked(previewTaskFilename);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
let previousIsReactActEnvironment: boolean | undefined;

beforeAll(() => {
  previousIsReactActEnvironment =
    reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT;
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT =
    previousIsReactActEnvironment;
});

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  mockPreview.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const Probe = ({
  args,
  onResult,
}: {
  args: UsePreviewTaskFilenameArgs;
  onResult: (result: PreviewTaskFilenamePayload) => void;
}) => {
  const result = usePreviewTaskFilename(args);
  useEffect(() => {
    onResult(result);
  });
  return null;
};

const captured: { current: PreviewTaskFilenamePayload | null } = {
  current: null,
};

const capture = (r: PreviewTaskFilenamePayload): void => {
  captured.current = r;
};

const defaultArgs: UsePreviewTaskFilenameArgs = {
  title: "Hello",
  explicitFilename: undefined,
  parentFilePath: undefined,
};

const pathPayload = (fileName: string): PreviewTaskFilenamePayload => ({
  kind: "path",
  fileName,
  relPath: `tasks/${fileName}`,
  fullPath: `/project/tasks/${fileName}`,
});

const mount = async (
  args: UsePreviewTaskFilenameArgs,
): Promise<PreviewTaskFilenamePayload | null> => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(Probe, { args, onResult: capture }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return captured.current;
};

const rerender = async (
  args: UsePreviewTaskFilenameArgs,
): Promise<PreviewTaskFilenamePayload | null> => {
  await act(async () => {
    root?.render(createElement(Probe, { args, onResult: capture }));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return captured.current;
};

test("初期レンダリングで pending を返す", async () => {
  mockPreview.mockImplementation(() => new Promise(() => {}));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const results: PreviewTaskFilenamePayload[] = [];
  act(() => {
    root?.render(
      createElement(Probe, {
        args: defaultArgs,
        onResult: (r) => {
          results.push(r);
        },
      }),
    );
  });
  expect(results[0]?.kind).toBe("pending");
});

test("IPC 成功後に path 結果に更新される", async () => {
  mockPreview.mockResolvedValue(Result.ok(pathPayload("hello.md")));

  const result = await mount(defaultArgs);
  expect(result).toEqual(pathPayload("hello.md"));
});

test("title 変更で新しい IPC 結果に更新される", async () => {
  mockPreview.mockResolvedValueOnce(Result.ok(pathPayload("hello.md")));
  await mount(defaultArgs);

  mockPreview.mockResolvedValueOnce(Result.ok(pathPayload("world.md")));
  const result = await rerender({ ...defaultArgs, title: "World" });
  expect(result).toEqual(pathPayload("world.md"));
});

test("explicitFilename 変更で IPC 再取得される", async () => {
  mockPreview.mockResolvedValue(Result.ok(pathPayload("custom.md")));
  await mount(defaultArgs);

  mockPreview.mockResolvedValue(Result.ok(pathPayload("custom.md")));
  await rerender({ ...defaultArgs, explicitFilename: "custom.md" });
  expect(mockPreview).toHaveBeenCalledTimes(2);
});

test("parentFilePath 変更で IPC 再取得される", async () => {
  mockPreview.mockResolvedValue(Result.ok(pathPayload("hello.md")));
  await mount(defaultArgs);

  mockPreview.mockResolvedValue(Result.ok(pathPayload("hello.md")));
  await rerender({ ...defaultArgs, parentFilePath: "issues/parent.md" });
  expect(mockPreview).toHaveBeenCalledTimes(2);
});

test("IPC エラー時は古いパス表示をpendingへ戻す", async () => {
  mockPreview.mockResolvedValueOnce(Result.ok(pathPayload("hello.md")));
  await mount(defaultArgs);

  mockPreview.mockResolvedValueOnce(
    Result.err({ code: "UNKNOWN", message: "fail" } as never),
  );
  const result = await rerender({ ...defaultArgs, title: "Changed" });
  expect(result?.kind).toBe("pending");
});

test("高速入力で stale 応答が破棄され最新のみ反映される", async () => {
  type OkPayload = ReturnType<typeof Result.ok<PreviewTaskFilenamePayload>>;
  const deferred: { resolve: ((v: OkPayload) => void) | null } = {
    resolve: null,
  };
  const firstPromise = new Promise<OkPayload>((resolve) => {
    deferred.resolve = resolve;
  });

  mockPreview.mockReturnValueOnce(firstPromise as never);
  await mount(defaultArgs);

  mockPreview.mockResolvedValueOnce(Result.ok(pathPayload("second.md")));
  await rerender({ ...defaultArgs, title: "Second" });

  deferred.resolve?.(Result.ok(pathPayload("first.md")));
  await act(async () => {
    await Promise.resolve();
  });

  expect(captured.current).toEqual(pathPayload("second.md"));
});
test("空のIPC応答では pending を維持する", async () => {
  mockPreview.mockResolvedValue(Result.ok(null as never));

  const result = await mount(defaultArgs);
  expect(result?.kind).toBe("pending");
});

test("path取得後の不正なIPC応答では pending に戻る", async () => {
  mockPreview.mockResolvedValueOnce(Result.ok(pathPayload("hello.md")));
  await mount(defaultArgs);

  mockPreview.mockResolvedValueOnce(Result.ok({ kind: "path" } as never));
  const result = await rerender({ ...defaultArgs, title: "Changed" });
  expect(result?.kind).toBe("pending");
});

test.each([
  { kind: "path" },
  { kind: "invalid" },
])("必須項目が欠けた %o のIPC応答では pending を維持する", async (payload) => {
  mockPreview.mockResolvedValue(Result.ok(payload as never));

  const result = await mount(defaultArgs);

  expect(result?.kind).toBe("pending");
});
