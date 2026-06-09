import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import {
  type AppView,
  normalizeAppView,
  type UseAppViewResult,
  useAppView,
} from "@/hooks/useAppView";

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

/**
 * コンポーネントをレンダリングするヘルパー
 * @param element - レンダリング対象の React 要素
 */
const render = (element: ReturnType<typeof createElement>) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
};

/**
 * useAppView の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null（描画は行わない）
 */
const UseAppViewProbe = ({
  onResult,
}: {
  onResult: (result: UseAppViewResult) => void;
}) => {
  const result = useAppView();
  useEffect(() => {
    onResult(result);
  });
  return null;
};

test("useAppView: 初期 view は board", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  expect((latest as unknown as UseAppViewResult).view).toBe("board");
});

test("useAppView: navigate('settings') で settings へ遷移する", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("settings");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("settings");
});

test("useAppView: navigate('board') で board へ戻る", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("settings");
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("board");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("board");
});

test("useAppView: navigate トグルで settings から board に戻る", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("settings");
  });
  const current = latest as unknown as UseAppViewResult;
  const next: AppView = current.view === "settings" ? "board" : "settings";
  act(() => {
    current.navigate(next);
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("board");
});

test("useAppView: navigate('detail') で detail へ遷移する", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("detail");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("detail");
});

test("useAppView: detail から board へ navigate できる（戻る動線）", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("detail");
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("board");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("board");
});

test("useAppView: detail から settings へ navigate できる（排他遷移）", () => {
  let latest: UseAppViewResult | null = null;
  render(
    createElement(UseAppViewProbe, {
      onResult: (r) => {
        latest = r;
      },
    }),
  );
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("detail");
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("settings");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("settings");
});

test.each([
  ["settings", "settings"],
  ["board", "board"],
  ["detail", "detail"],
  ["milestone", "milestone"],
  ["create", "create"],
  ["xxx", "board"],
  ["", "board"],
])("normalizeAppView('%s') は '%s' を返す（生文字列 → AppView 正規化）", (input, expected) => {
  expect(normalizeAppView(input)).toBe(expected);
});
