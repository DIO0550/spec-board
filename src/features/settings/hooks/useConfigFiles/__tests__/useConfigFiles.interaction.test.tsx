import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type UseConfigFilesResult,
  useConfigFiles,
} from "@/features/settings/hooks/useConfigFiles";
import {
  getConfigFiles,
  openConfigFile,
  regenerateGuide,
  TauriError,
} from "@/lib/tauri";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getConfigFiles: vi.fn(),
    openConfigFile: vi.fn(),
    regenerateGuide: vi.fn(),
  };
});

const files = [
  {
    id: "config" as const,
    name: "config.json",
    path: ".spec-board/config.json",
    badge: "1 KB",
    language: "JSON" as const,
    content: "{}",
    generated: false,
  },
  {
    id: "guide" as const,
    name: "GUIDE.md",
    path: ".spec-board/GUIDE.md",
    badge: "自動生成",
    language: "Markdown" as const,
    content: "# Guide",
    generated: true,
  },
];

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

const Probe = ({
  onResult,
  projectKey,
}: {
  onResult: (value: UseConfigFilesResult) => void;
  projectKey?: string;
}) => {
  const value = useConfigFiles(projectKey);
  useEffect(() => {
    onResult(value);
  });
  return null;
};

const mount = async () => {
  let latest: UseConfigFilesResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(Probe, {
        projectKey: "/project/default",
        onResult: (value) => (latest = value),
      }),
    );
  });
  return {
    get latest() {
      return latest as UseConfigFilesResult;
    },
  };
};

test("project未openでは読まず、open後に読み込んで回復する", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(Result.ok({ files }));
  let latest: UseConfigFilesResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      createElement(Probe, {
        projectKey: undefined,
        onResult: (value) => (latest = value),
      }),
    ),
  );
  expect(getConfigFiles).not.toHaveBeenCalled();
  await act(async () =>
    root?.render(
      createElement(Probe, {
        projectKey: "/project/a",
        onResult: (value) => (latest = value),
      }),
    ),
  );
  expect((latest as UseConfigFilesResult | null)?.status).toBe("ready");
});

test("project切替後に遅れて返る旧project応答を無視する", async () => {
  let resolveOld:
    | ((value: ReturnType<typeof Result.ok<{ files: typeof files }>>) => void)
    | undefined;
  vi.mocked(getConfigFiles)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(Result.ok({ files: [files[1]] }));
  let latest: UseConfigFilesResult | null = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      createElement(Probe, {
        projectKey: "/project/a",
        onResult: (value) => (latest = value),
      }),
    ),
  );
  await act(async () =>
    root?.render(
      createElement(Probe, {
        projectKey: "/project/b",
        onResult: (value) => (latest = value),
      }),
    ),
  );
  await act(async () => resolveOld?.(Result.ok({ files })));
  expect((latest as UseConfigFilesResult | null)?.files).toEqual([files[1]]);
});

test("mount時に実ファイルを読み込みreadyへ遷移する", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(Result.ok({ files }));
  const probe = await mount();
  expect(probe.latest.status).toBe("ready");
  expect(probe.latest.files).toEqual(files);
});

test("read失敗をerror stateとして公開する", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(
    Result.err(TauriError.from("read failed")),
  );
  const probe = await mount();
  expect(probe.latest.status).toBe("error");
  expect(probe.latest.error).toContain("read failed");
});

test("success payloadが欠落していてもrejectせずtyped errorを公開する", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(
    Result.ok(undefined) as unknown as Awaited<
      ReturnType<typeof getConfigFiles>
    >,
  );
  const probe = await mount();
  expect(probe.latest.status).toBe("error");
  expect(probe.latest.files).toEqual([]);
  expect(probe.latest.error).toBe("設定ファイルの応答形式が不正です");
});

test("copyはbrowser clipboard境界へ選択内容を渡す", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(Result.ok({ files }));
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const probe = await mount();
  await act(async () => probe.latest.copy("guide"));
  expect(writeText).toHaveBeenCalledWith("# Guide");
});

test("GUIDE再生成成功時にviewer内容を差し替える", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(Result.ok({ files }));
  vi.mocked(regenerateGuide).mockResolvedValue(
    Result.ok({ ...files[1], content: "# New Guide" }),
  );
  const probe = await mount();
  await act(async () => probe.latest.regenerate());
  expect(probe.latest.files[1]?.content).toBe("# New Guide");
  expect(probe.latest.isRegenerating).toBe(false);
});

test("labels sourceを固定targetとして外部表示できる", async () => {
  vi.mocked(getConfigFiles).mockResolvedValue(Result.ok({ files }));
  vi.mocked(openConfigFile).mockResolvedValue(Result.ok(undefined));
  const probe = await mount();
  await act(async () => probe.latest.openExternal("labels"));
  expect(openConfigFile).toHaveBeenCalledWith({ target: "labels" });
});
