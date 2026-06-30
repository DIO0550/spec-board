import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { unregisterToastSink } from "@/lib/tauri";
import { getToastSink } from "@/lib/tauri/toastSink";
import { ToastProvider, useToasts } from "@/providers/ToastProvider";
import type { ToastType, UseToastsResult } from "@/types/toast";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  // 並行テストでの stale sink を防ぐため必ず解除する。
  unregisterToastSink();
});

/**
 * コンポーネントをレンダリングするヘルパー。
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
 * useToasts の戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null（描画は行わない）
 */
const UseToastsProbe = ({
  onResult,
}: {
  onResult: (result: UseToastsResult) => void;
}) => {
  const result = useToasts();
  useEffect(() => {
    onResult(result);
  });
  return null;
};

/**
 * `<ToastProvider>` で UseToastsProbe をラップして render する糖衣。
 * @param onResult - 各 render で useToasts の戻り値を受け取るコールバック
 */
const renderWithProvider = (onResult: (result: UseToastsResult) => void) => {
  render(
    createElement(
      ToastProvider,
      null,
      createElement(UseToastsProbe, { onResult }),
    ),
  );
};

// ---- 正常系 ----

test("useToasts: 初期 toasts は空配列", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  expect((latest as unknown as UseToastsResult).toasts).toEqual([]);
});

test("useToasts: showToast で 1 件追加される（success）", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("ok", "success");
  });
  const toasts = (latest as unknown as UseToastsResult).toasts;
  expect(toasts.length).toBe(1);
  expect(toasts[0].message).toBe("ok");
  expect(toasts[0].type).toBe("success");
});

// 'error' / 'warning' 単独テストは「異なる ToastType をミックスで積める」で兼ねるため非掲載。
// showToast は type を分岐なく payload に詰めるだけのため、type 別の独立テストはリグレッション保護に
// 寄与しない（type 追加のたびに同型テストが線形増殖する）。

test("useToasts: 複数 showToast の順序が保持される", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
    (latest as unknown as UseToastsResult).showToast("b", "error");
    (latest as unknown as UseToastsResult).showToast("c", "warning");
  });
  expect(
    (latest as unknown as UseToastsResult).toasts.map((t) => t.message),
  ).toEqual(["a", "b", "c"]);
});

test("useToasts: dismissToast で指定 id のみ削除される", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
    (latest as unknown as UseToastsResult).showToast("b", "success");
    (latest as unknown as UseToastsResult).showToast("c", "success");
  });
  const midId = (latest as unknown as UseToastsResult).toasts[1].id;
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast(midId);
  });
  const remaining = (latest as unknown as UseToastsResult).toasts.map(
    (t) => t.message,
  );
  expect(remaining).toEqual(["a", "c"]);
});

test("useToasts: dismissToast で配列順序が保持される", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
    (latest as unknown as UseToastsResult).showToast("b", "success");
    (latest as unknown as UseToastsResult).showToast("c", "success");
    (latest as unknown as UseToastsResult).showToast("d", "success");
  });
  const idAt1 = (latest as unknown as UseToastsResult).toasts[1].id;
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast(idAt1);
  });
  expect(
    (latest as unknown as UseToastsResult).toasts.map((t) => t.message),
  ).toEqual(["a", "c", "d"]);
});

test("useToasts: showToast → dismiss → showToast で再積み上げできる", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
  });
  const firstId = (latest as unknown as UseToastsResult).toasts[0].id;
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast(firstId);
  });
  expect((latest as unknown as UseToastsResult).toasts).toEqual([]);
  act(() => {
    (latest as unknown as UseToastsResult).showToast("b", "success");
  });
  const toasts = (latest as unknown as UseToastsResult).toasts;
  expect(toasts.length).toBe(1);
  expect(toasts[0].message).toBe("b");
  expect(toasts[0].id).not.toBe(firstId);
});

// ---- 境界値 ----

test("useToasts: 空配列に対する dismissToast はクラッシュしない", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast("x");
  });
  expect((latest as unknown as UseToastsResult).toasts).toEqual([]);
});

test("useToasts: 存在しない id の dismissToast は配列を変えない", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
  });
  const before = (latest as unknown as UseToastsResult).toasts;
  act(() => {
    (latest as unknown as UseToastsResult).dismissToast("not-exist");
  });
  expect((latest as unknown as UseToastsResult).toasts).toEqual(before);
});

test("useToasts: 空文字メッセージの showToast が追加される", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("", "success");
  });
  expect((latest as unknown as UseToastsResult).toasts[0].message).toBe("");
});

// ---- エッジケース ----

test("useToasts: 連続 showToast で id がユニーク", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
    (latest as unknown as UseToastsResult).showToast("b", "success");
    (latest as unknown as UseToastsResult).showToast("c", "success");
  });
  const ids = (latest as unknown as UseToastsResult).toasts.map((t) => t.id);
  expect(new Set(ids).size).toBe(3);
});

test("useToasts: showToast の参照同一性が render 横断で保たれる", () => {
  const results: UseToastsResult[] = [];
  renderWithProvider((r) => {
    results.push(r);
  });
  act(() => {
    results[0].showToast("a", "success");
  });
  const first = results[0];
  const last = results[results.length - 1];
  expect(Object.is(first.showToast, last.showToast)).toBe(true);
});

test("useToasts: dismissToast の参照同一性が render 横断で保たれる", () => {
  const results: UseToastsResult[] = [];
  renderWithProvider((r) => {
    results.push(r);
  });
  act(() => {
    results[0].showToast("a", "success");
  });
  const first = results[0];
  const last = results[results.length - 1];
  expect(Object.is(first.dismissToast, last.dismissToast)).toBe(true);
});

test("useToasts: 異なる ToastType をミックスで積める", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("a", "success");
    (latest as unknown as UseToastsResult).showToast("b", "error");
    (latest as unknown as UseToastsResult).showToast("c", "warning");
  });
  const types: ToastType[] = (latest as unknown as UseToastsResult).toasts.map(
    (t) => t.type,
  );
  expect(types).toEqual(["success", "error", "warning"]);
});

// ---- 異常系 ----

test("useToasts: Provider 外で呼ぶと throw する", () => {
  // 子コンポーネントの throw は React が console.error に流すためノイズ抑止する。
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => {
      render(createElement(UseToastsProbe, { onResult: () => {} }));
    }).toThrow();
  } finally {
    errorSpy.mockRestore();
  }
});

test("useToasts: throw メッセージに 'ToastProvider' を含む", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => {
      render(createElement(UseToastsProbe, { onResult: () => {} }));
    }).toThrow(/ToastProvider/);
  } finally {
    errorSpy.mockRestore();
  }
});

test("useToasts: throw メッセージに 'useToasts' を含む", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() => {
      render(createElement(UseToastsProbe, { onResult: () => {} }));
    }).toThrow(/useToasts/);
  } finally {
    errorSpy.mockRestore();
  }
});

// ---- 副作用配線 ----

test("registerToastSink: Provider mount で sink が登録される", () => {
  renderWithProvider(() => {});
  expect(getToastSink()).not.toBeNull();
});

test("registerToastSink: sink 経由 showToast が toasts に反映される", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  const sink = getToastSink();
  expect(sink).not.toBeNull();
  act(() => {
    sink?.("via-sink", "error");
  });
  expect((latest as unknown as UseToastsResult).toasts[0].message).toBe(
    "via-sink",
  );
  expect((latest as unknown as UseToastsResult).toasts[0].type).toBe("error");
});

test("registerToastSink: Provider unmount で sink が解除される", () => {
  renderWithProvider(() => {});
  expect(getToastSink()).not.toBeNull();
  act(() => {
    root?.unmount();
  });
  root = null;
  expect(getToastSink()).toBeNull();
});

test("registerToastSink: Provider 再 mount で新しい sink が登録される", () => {
  renderWithProvider(() => {});
  const firstSink = getToastSink();
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  renderWithProvider(() => {});
  const secondSink = getToastSink();
  expect(secondSink).not.toBeNull();
  expect(secondSink).not.toBe(firstSink);
});

test("registerToastSink: 古い sink を呼んでも新 Provider の toasts は変わらない", () => {
  // 1 つ目の Provider をマウントして sink への参照を確保する。
  renderWithProvider(() => {});
  const oldSink = getToastSink();
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  // 2 つ目の Provider をマウントし、toasts を観測する。
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    oldSink?.("stale", "success");
  });
  // 旧 sink は旧 setToasts に閉じているため、新 Provider の toasts には何も入らない。
  expect((latest as unknown as UseToastsResult).toasts).toEqual([]);
});

test("registerToastSink: StrictMode 配下でも sink 経由 showToast が toasts に反映される", () => {
  let latest: UseToastsResult | null = null;
  render(
    createElement(
      StrictMode,
      null,
      createElement(
        ToastProvider,
        null,
        createElement(UseToastsProbe, {
          onResult: (r: UseToastsResult) => {
            latest = r;
          },
        }),
      ),
    ),
  );
  const sink = getToastSink();
  expect(sink).not.toBeNull();
  act(() => {
    sink?.("strict", "success");
  });
  const toasts = (latest as unknown as UseToastsResult).toasts;
  expect(toasts.length).toBe(1);
  expect(toasts[0].message).toBe("strict");
});

test("registerToastSink: StrictMode mount で sink / Provider 由来の警告が出ない", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      createElement(
        StrictMode,
        null,
        createElement(
          ToastProvider,
          null,
          createElement(UseToastsProbe, { onResult: () => {} }),
        ),
      ),
    );
    // happy-dom 環境の既知良性ログ（act 非対応）以外の console.error 出力を凍結する。
    const callTexts = errorSpy.mock.calls.map((call) =>
      call.map((arg) => String(arg ?? "")).join(" "),
    );
    const unexpected = callTexts.filter(
      (text) => !text.includes("not configured to support act"),
    );
    expect(unexpected).toEqual([]);
  } finally {
    errorSpy.mockRestore();
  }
});

// ---- パフォーマンス ----

test("useToasts: Context value が同じ toasts のとき stable な参照を返す", () => {
  const results: UseToastsResult[] = [];
  renderWithProvider((r) => {
    results.push(r);
  });
  // showToast/dismissToast の参照が render 横断で安定なため、value も
  // toasts が変わらない限り useMemo によって同一参照を返す。
  expect(
    Object.is(results[0].showToast, results[results.length - 1].showToast),
  ).toBe(true);
  expect(
    Object.is(
      results[0].dismissToast,
      results[results.length - 1].dismissToast,
    ),
  ).toBe(true);
});

test("useToasts: showToast / dismiss を連発しても React 警告が出ない", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  let latest: UseToastsResult | null = null;
  try {
    renderWithProvider((r) => {
      latest = r;
    });
    act(() => {
      (latest as unknown as UseToastsResult).showToast("a", "success");
      (latest as unknown as UseToastsResult).showToast("b", "error");
    });
    act(() => {
      const id = (latest as unknown as UseToastsResult).toasts[0].id;
      (latest as unknown as UseToastsResult).dismissToast(id);
    });
    const callTexts = errorSpy.mock.calls.map((call) =>
      call.map((arg) => String(arg ?? "")).join(" "),
    );
    const messages = callTexts.join("\n");
    expect(messages).not.toMatch(
      /Cannot update a component[\s\S]*while rendering/,
    );
    expect(messages).not.toMatch(/Maximum update depth exceeded/);
  } finally {
    errorSpy.mockRestore();
  }
});

// ---- 内蔵 Container ----

test("内蔵 Container: toasts 0 件のときは toast-container が描かれない", () => {
  renderWithProvider(() => {});
  expect(document.querySelector('[data-testid="toast-container"]')).toBeNull();
});

test("内蔵 Container: toasts 1 件以上のとき内蔵 Container が描画する", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("hello", "success");
  });
  const containerEl = document.querySelector('[data-testid="toast-container"]');
  expect(containerEl).toBeTruthy();
  const items = containerEl?.querySelectorAll("[data-toast-id]") ?? [];
  expect(items.length).toBe(1);
  expect(containerEl?.textContent).toContain("hello");
});

test("内蔵 Container: Provider unmount で Container も unmount される", () => {
  let latest: UseToastsResult | null = null;
  renderWithProvider((r) => {
    latest = r;
  });
  act(() => {
    (latest as unknown as UseToastsResult).showToast("hello", "success");
  });
  expect(
    document.querySelector('[data-testid="toast-container"]'),
  ).toBeTruthy();
  act(() => {
    root?.unmount();
  });
  root = null;
  expect(document.querySelector('[data-testid="toast-container"]')).toBeNull();
});

test("内蔵 Container: children=null でも内蔵 Container は生存する", () => {
  // children なしで Provider をマウントし、sink 経由で push しても内蔵 Container が描画する。
  render(createElement(ToastProvider, null));
  const sink = getToastSink();
  expect(sink).not.toBeNull();
  act(() => {
    sink?.("alive", "success");
  });
  const containerEl = document.querySelector('[data-testid="toast-container"]');
  expect(containerEl).toBeTruthy();
  expect(containerEl?.textContent).toContain("alive");
});
