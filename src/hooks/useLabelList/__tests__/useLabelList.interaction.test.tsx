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
import { type LabelListState, useLabelList } from "@/hooks/useLabelList";
import { getLabels, type LabelDefinition, TauriError } from "@/lib/tauri";
import { Result } from "@/utils/result";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    getLabels: vi.fn(),
  };
});

const getLabelsMock = vi.mocked(getLabels);

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

beforeEach(() => {
  getLabelsMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * useLabelList の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null（描画は行わない）
 */
const UseLabelListProbe = ({
  onResult,
}: {
  onResult: (result: LabelListState) => void;
}) => {
  const result = useLabelList();
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * Probe をマウントし、effect の getLabels 解決まで待つ。
 * @param onResult - 最新 state を受け取るコールバック
 */
const mountProbe = async (onResult: (result: LabelListState) => void) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(UseLabelListProbe, { onResult }));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const sampleLabels: LabelDefinition[] = [
  { name: "type:feature" },
  { name: "priority:high" },
];

test("getLabels が ok(labels) を返すと最終 state が loaded(labels) になる", async () => {
  getLabelsMock.mockResolvedValue(Result.ok({ labels: sampleLabels }));
  let latest: LabelListState | null = null;
  await mountProbe((r) => {
    latest = r;
  });
  expect(latest).toEqual({ kind: "loaded", labels: sampleLabels });
});

test("getLabels が ok(labels:[]) を返すと loaded の空一覧になる（error ではない）", async () => {
  getLabelsMock.mockResolvedValue(Result.ok({ labels: [] }));
  let latest: LabelListState | null = null;
  await mountProbe((r) => {
    latest = r;
  });
  expect(latest).toEqual({ kind: "loaded", labels: [] });
});

test("getLabels が err を返すと state が error になる", async () => {
  getLabelsMock.mockResolvedValue(Result.err(TauriError.from("読み込み失敗")));
  let latest: LabelListState | null = null;
  await mountProbe((r) => {
    latest = r;
  });
  expect(latest).toEqual({ kind: "error" });
});

test("取得 resolve 前にアンマウントしても setState 警告/例外が出ない", async () => {
  let resolveGetLabels:
    | ((value: Awaited<ReturnType<typeof getLabels>>) => void)
    | null = null;
  getLabelsMock.mockReturnValue(
    new Promise((resolve) => {
      resolveGetLabels = resolve;
    }),
  );
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(UseLabelListProbe, { onResult: () => {} }));
  });
  // resolve 前にアンマウント
  act(() => {
    root?.unmount();
  });
  root = null;
  await act(async () => {
    resolveGetLabels?.(Result.ok({ labels: sampleLabels }));
    await Promise.resolve();
  });

  expect(errorSpy).not.toHaveBeenCalled();
  errorSpy.mockRestore();
});
