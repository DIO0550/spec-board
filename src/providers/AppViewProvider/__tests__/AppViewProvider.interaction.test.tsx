import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import {
  type AppView,
  AppViewProvider,
  type UseAppViewResult,
  useAppView,
} from "@/providers/AppViewProvider";

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

/**
 * `<AppViewProvider>` で UseAppViewProbe をラップして render する糖衣。
 * AppViewProvider は完全 uncontrolled なので `value` prop を渡さない。
 * @param onResult - 各 render で useAppView の戻り値を受け取るコールバック
 */
const renderWithProvider = (onResult: (result: UseAppViewResult) => void) => {
  render(
    createElement(
      AppViewProvider,
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

test("useAppView: detail から settings へ navigate できる(排他遷移)", () => {
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

test("useAppView: navigate を連発しても React 警告が console.error に出ない", () => {
  // 完全 uncontrolled 化により Provider 内部 setState で navigate が解決され、
  // 「別コンポーネントの state を render 中に更新」警告 / 無限更新警告のいずれも
  // 出ないことを凍結する（R-10）。
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let latest: UseAppViewResult | null = null;
  try {
    renderWithProvider((r) => {
      latest = r;
    });
    act(() => {
      (latest as unknown as UseAppViewResult).navigate("settings");
    });
    act(() => {
      (latest as unknown as UseAppViewResult).navigate("detail");
    });
    act(() => {
      (latest as unknown as UseAppViewResult).navigate("milestone");
    });
    act(() => {
      (latest as unknown as UseAppViewResult).navigate("create");
    });
    act(() => {
      (latest as unknown as UseAppViewResult).navigate("board");
    });
    // React の警告は `"... %s ..."` フォーマット + 追加引数で来るため、第1引数だけ
    // 文字列化するとプレースホルダが解決されず assertion をすり抜けることがある。
    // 全引数を String 化して連結し、メッセージと追加引数のどちらに含まれていても
    // マッチするよう中間任意文字を許容する正規表現で検査する。
    const callTexts = errorSpy.mock.calls.map((call) =>
      call.map((arg) => String(arg ?? "")).join(" "),
    );
    const messages = callTexts.join("\n");
    expect(messages).not.toMatch(
      /Cannot update a component[\s\S]*while rendering/,
    );
    expect(messages).not.toMatch(/Maximum update depth exceeded/);
    // `console.error` を mock している間は React の他 Warning や予期しない例外ログも
    // 黙殺されるため、既知の良性ログ（happy-dom 環境の act 警告）を除いて出力ゼロを凍結する。
    // 既知良性パターンを増やす場合はここに追加すること。
    const unexpectedCalls = callTexts.filter(
      (text) => !text.includes("not configured to support act"),
    );
    expect(unexpectedCalls).toEqual([]);
  } finally {
    errorSpy.mockRestore();
  }
});
