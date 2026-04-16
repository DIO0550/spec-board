import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
	TOAST_DEFAULT_DURATION_MS,
	Toast,
	ToastContainer,
	type ToastItem,
	type ToastType,
	type UseToastsResult,
	useToasts,
} from "./Toast";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	root = null;
	container?.remove();
	container = null;
	vi.useRealTimers();
});

/**
 * コンポーネントをレンダリングするヘルパー
 * @param element - レンダリング対象の React 要素
 */
function render(element: ReturnType<typeof createElement>) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

/**
 * テスト用の ToastItem を生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用 ToastItem
 */
function createToast(overrides: Partial<ToastItem> = {}): ToastItem {
	return {
		id: "toast-1",
		message: "メッセージ",
		type: "success",
		...overrides,
	};
}

test("successタイプのトーストが緑系で表示される", () => {
	render(
		createElement(Toast, {
			toast: createToast({ type: "success", message: "保存しました" }),
			onDismiss: vi.fn(),
		}),
	);
	const el = document.querySelector('[data-testid="toast-success"]');
	expect(el).toBeTruthy();
	expect(el?.textContent).toBe("保存しました");
	expect(el?.className).toContain("bg-green-600");
});

test("errorタイプのトーストが赤系で表示されaria-liveがassertive", () => {
	render(
		createElement(Toast, {
			toast: createToast({ type: "error", message: "失敗しました" }),
			onDismiss: vi.fn(),
		}),
	);
	const el = document.querySelector('[data-testid="toast-error"]');
	expect(el).toBeTruthy();
	expect(el?.className).toContain("bg-red-600");
	expect(el?.getAttribute("role")).toBe("alert");
	expect(el?.getAttribute("aria-live")).toBe("assertive");
});

test("warningタイプのトーストが黄系で表示される", () => {
	render(
		createElement(Toast, {
			toast: createToast({ type: "warning", message: "注意" }),
			onDismiss: vi.fn(),
		}),
	);
	const el = document.querySelector('[data-testid="toast-warning"]');
	expect(el).toBeTruthy();
	expect(el?.className).toContain("bg-yellow-500");
});

test("デフォルトで3秒後にonDismissが呼ばれる", () => {
	const onDismiss = vi.fn();
	render(
		createElement(Toast, {
			toast: createToast({ id: "t-auto" }),
			onDismiss,
		}),
	);
	expect(onDismiss).not.toHaveBeenCalled();
	act(() => {
		vi.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS);
	});
	expect(onDismiss).toHaveBeenCalledWith("t-auto");
});

test("duration指定時はその時間経過後にonDismissが呼ばれる", () => {
	const onDismiss = vi.fn();
	render(
		createElement(Toast, {
			toast: createToast({ id: "t-custom" }),
			onDismiss,
			duration: 500,
		}),
	);
	act(() => {
		vi.advanceTimersByTime(499);
	});
	expect(onDismiss).not.toHaveBeenCalled();
	act(() => {
		vi.advanceTimersByTime(1);
	});
	expect(onDismiss).toHaveBeenCalledWith("t-custom");
});

test("ToastContainerは空配列のときは何も描画しない", () => {
	render(
		createElement(ToastContainer, {
			toasts: [],
			onDismiss: vi.fn(),
		}),
	);
	expect(document.querySelector('[data-testid="toast-container"]')).toBeNull();
});

test("複数のトーストがスタック表示される", () => {
	const toasts: ToastItem[] = [
		{ id: "a", message: "1件目", type: "success" },
		{ id: "b", message: "2件目", type: "error" },
		{ id: "c", message: "3件目", type: "warning" },
	];
	render(
		createElement(ToastContainer, {
			toasts,
			onDismiss: vi.fn(),
		}),
	);
	const containerEl = document.querySelector('[data-testid="toast-container"]');
	expect(containerEl).toBeTruthy();
	const items = containerEl?.querySelectorAll("[data-toast-id]") ?? [];
	expect(items.length).toBe(3);
	expect(items[0].getAttribute("data-toast-id")).toBe("a");
	expect(items[1].getAttribute("data-toast-id")).toBe("b");
	expect(items[2].getAttribute("data-toast-id")).toBe("c");
});

/**
 * useToasts フックの戻り値を外部に公開するテスト用コンポーネント。
 * @param props - フック値を受け取るコールバック
 * @returns null（描画は行わない）
 */
function UseToastsProbe({
	onResult,
}: {
	onResult: (result: UseToastsResult) => void;
}) {
	const result = useToasts();
	useEffect(() => {
		onResult(result);
	});
	return null;
}

test("useToasts: showToast でトーストが追加され末尾に積まれる", () => {
	let latest: UseToastsResult | null = null;
	render(
		createElement(UseToastsProbe, {
			onResult: (r) => {
				latest = r;
			},
		}),
	);
	expect(latest).not.toBeNull();
	const probe = latest as unknown as UseToastsResult;

	act(() => {
		probe.showToast("1件目", "success" satisfies ToastType);
	});
	expect((latest as unknown as UseToastsResult).toasts.length).toBe(1);
	expect((latest as unknown as UseToastsResult).toasts[0].message).toBe(
		"1件目",
	);
	expect((latest as unknown as UseToastsResult).toasts[0].type).toBe("success");

	act(() => {
		(latest as unknown as UseToastsResult).showToast(
			"2件目",
			"error" satisfies ToastType,
		);
	});
	const toasts = (latest as unknown as UseToastsResult).toasts;
	expect(toasts.length).toBe(2);
	expect(toasts[1].message).toBe("2件目");
	expect(toasts[1].type).toBe("error");
});

test("useToasts: showToast は毎回ユニークな ID を生成する", () => {
	let latest: UseToastsResult | null = null;
	render(
		createElement(UseToastsProbe, {
			onResult: (r) => {
				latest = r;
			},
		}),
	);
	const probe = latest as unknown as UseToastsResult;
	act(() => {
		probe.showToast("a", "success");
		probe.showToast("b", "success");
		probe.showToast("c", "success");
	});
	const ids = (latest as unknown as UseToastsResult).toasts.map((t) => t.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test("useToasts: dismissToast で指定 ID のみが取り除かれる", () => {
	let latest: UseToastsResult | null = null;
	render(
		createElement(UseToastsProbe, {
			onResult: (r) => {
				latest = r;
			},
		}),
	);
	const probe = latest as unknown as UseToastsResult;
	act(() => {
		probe.showToast("a", "success");
		probe.showToast("b", "success");
		probe.showToast("c", "success");
	});
	const targetId = (latest as unknown as UseToastsResult).toasts[1].id;
	act(() => {
		(latest as unknown as UseToastsResult).dismissToast(targetId);
	});
	const remaining = (latest as unknown as UseToastsResult).toasts;
	expect(remaining.length).toBe(2);
	expect(remaining.some((t) => t.id === targetId)).toBe(false);
	expect(remaining[0].message).toBe("a");
	expect(remaining[1].message).toBe("c");
});

test("useToasts: 存在しない ID の dismissToast は配列に影響しない", () => {
	let latest: UseToastsResult | null = null;
	render(
		createElement(UseToastsProbe, {
			onResult: (r) => {
				latest = r;
			},
		}),
	);
	const probe = latest as unknown as UseToastsResult;
	act(() => {
		probe.showToast("a", "success");
	});
	const before = (latest as unknown as UseToastsResult).toasts;
	act(() => {
		(latest as unknown as UseToastsResult).dismissToast("not-exist");
	});
	const after = (latest as unknown as UseToastsResult).toasts;
	expect(after.length).toBe(before.length);
	expect(after[0].id).toBe(before[0].id);
});
