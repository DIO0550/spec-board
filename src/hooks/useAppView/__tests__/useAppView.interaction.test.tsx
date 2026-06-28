import {
  act,
  createElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type AppView,
  AppViewProvider,
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
 * AppViewProvider が controlled な薄いラッパに変わったため、本番の AppShell と
 * 同じ shape（useState + useCallback + useMemo）を内側で組み立てる小さな
 * テスト用ホスト。Provider 外 throw 検証のとき以外はこのホスト経由でマウントする。
 * @param props - 配下に置く React 要素
 * @returns AppViewProvider でラップした children
 */
const TestAppViewHost = ({ children }: { children: ReactNode }) => {
  const [view, setView] = useState<AppView>("board");
  const navigate = useCallback((next: AppView) => {
    setView(next);
  }, []);
  const value = useMemo<UseAppViewResult>(
    () => ({ view, navigate }),
    [view, navigate],
  );
  return createElement(AppViewProvider, { value, children });
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

/**
 * TestAppViewHost で UseAppViewProbe をラップして render する糖衣。
 * @param onResult - 各 render で useAppView の戻り値を受け取るコールバック
 */
const renderWithProvider = (onResult: (result: UseAppViewResult) => void) => {
  render(
    createElement(
      TestAppViewHost,
      null,
      createElement(UseAppViewProbe, { onResult }),
    ),
  );
};

test("useAppView: 初期 view は board", () => {
  let latest: UseAppViewResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("board");
});

test("useAppView: navigate('settings') で settings へ遷移する", () => {
  let latest: UseAppViewResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("settings");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("settings");
});

test("useAppView: navigate('board') で board へ戻る", () => {
  let latest: UseAppViewResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
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
  renderWithProvider((r) => {
    latest = r;
  });
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
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("detail");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("detail");
});

test("useAppView: detail から board へ navigate できる（戻る動線）", () => {
  let latest: UseAppViewResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
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
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("detail");
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("settings");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("settings");
});

test("useAppView: Provider 外で呼ぶと AppViewProvider が必要だと throw する", () => {
  // React は子コンポーネントの throw を console.error に流すため、テスト中の
  // ノイズを抑える。finally で必ず restore する。
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => {
      render(createElement(UseAppViewProbe, { onResult: () => {} }));
    }).toThrow(/AppViewProvider/);
  } finally {
    errorSpy.mockRestore();
  }
});

test("useAppView: navigate は render 横断で参照同一性を保つ", () => {
  const results: UseAppViewResult[] = [];
  renderWithProvider((r) => {
    results.push(r);
  });
  const first = results[0];
  act(() => {
    first.navigate("settings");
  });
  const last = results[results.length - 1];
  // 関数 identity が安定なら、view が変わっても navigate は同一参照のままになる。
  expect(Object.is(first.navigate, last.navigate)).toBe(true);
});

test("useAppView: 同一 view への navigate は view を変えない", () => {
  const results: UseAppViewResult[] = [];
  renderWithProvider((r) => {
    results.push(r);
  });
  const baseLength = results.length;
  act(() => {
    // 既に "board" 状態なので、同値 set による再 render は React 19 既定で発火しない。
    results[0].navigate("board");
  });
  expect(results.length).toBe(baseLength);
  expect(results[results.length - 1].view).toBe("board");
});

test("useAppView: navigate('milestone') で milestone へ遷移する", () => {
  let latest: UseAppViewResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("milestone");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("milestone");
});

test("useAppView: navigate('create') で create へ遷移する", () => {
  let latest: UseAppViewResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseAppViewResult).navigate("create");
  });
  expect((latest as unknown as UseAppViewResult).view).toBe("create");
});
