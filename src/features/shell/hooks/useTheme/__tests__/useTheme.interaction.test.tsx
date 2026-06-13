import { act, createElement } from "react";
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
import { ThemeProvider } from "@/features/shell/hooks/useTheme";
import { saveAppearance } from "@/features/shell/lib/appearanceStorage";
import { applyAppearanceDataset } from "@/features/shell/lib/applyAppearance";
import type { Appearance } from "@/features/shell/types";

vi.mock("@/features/shell/lib/appearanceStorage", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/shell/lib/appearanceStorage")
  >("@/features/shell/lib/appearanceStorage");
  return {
    ...actual,
    saveAppearance: vi.fn(),
    loadAppearance: vi.fn(),
  };
});

vi.mock("@/features/shell/lib/applyAppearance", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/shell/lib/applyAppearance")
  >("@/features/shell/lib/applyAppearance");
  return {
    ...actual,
    applyAppearanceDataset: vi.fn(),
  };
});

const saveAppearanceMock = vi.mocked(saveAppearance);
const applyAppearanceDatasetMock = vi.mocked(applyAppearanceDataset);
const loadAppearanceMock = vi.mocked(
  // 同一モジュール内でモック化した loadAppearance を取得する。
  (await import("@/features/shell/lib/appearanceStorage")).loadAppearance,
);

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

type MediaQueryListener = (event: { matches: boolean }) => void;

let matches = false;
const listeners = new Set<MediaQueryListener>();

const emitSystemColorChange = (nextMatches: boolean): void => {
  matches = nextMatches;
  for (const listener of listeners) {
    listener({ matches: nextMatches });
  }
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  matches = false;
  listeners.clear();
  saveAppearanceMock.mockReset();
  applyAppearanceDatasetMock.mockReset();
  loadAppearanceMock.mockReset();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: MediaQueryListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: MediaQueryListener) => {
      listeners.delete(listener);
    },
  }));
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const mountProvider = async (appearance: Appearance): Promise<void> => {
  loadAppearanceMock.mockReturnValue(appearance);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(ThemeProvider, null, null));
  });
};

test("OS 配色が変わると dataset は再適用されるが saveAppearance は再呼び出しされない", async () => {
  await mountProvider({
    theme: "system",
    density: "comfortable",
    accent: "blue",
  });

  // マウント時に保存と dataset 適用が 1 回ずつ走る。
  expect(saveAppearanceMock).toHaveBeenCalledTimes(1);
  const datasetCallsAfterMount = applyAppearanceDatasetMock.mock.calls.length;

  // OS の配色をダークへ切り替える。
  await act(async () => {
    emitSystemColorChange(true);
  });

  // 保存内容は appearance に依存し OS 配色では変わらないため再保存されない。
  expect(saveAppearanceMock).toHaveBeenCalledTimes(1);
  // dataset 反映は OS 配色にも追従するため再適用される。
  expect(applyAppearanceDatasetMock.mock.calls.length).toBeGreaterThan(
    datasetCallsAfterMount,
  );
  expect(applyAppearanceDatasetMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ theme: "dark" }),
  );
});
