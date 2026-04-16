import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

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
 * ConfirmDialog をレンダリングするヘルパー
 * @param props - ConfirmDialog に渡す props
 */
function render(props: Parameters<typeof ConfirmDialog>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(ConfirmDialog, props));
	});
}

test("タイトルとメッセージが表示される", () => {
	render({
		title: "削除確認",
		message: "本当に削除しますか？",
		onConfirm: vi.fn(),
		onCancel: vi.fn(),
	});
	const dialog = document.querySelector('[data-testid="confirm-dialog"]');
	expect(dialog?.textContent).toContain("削除確認");
	expect(dialog?.textContent).toContain("本当に削除しますか？");
});

test("確定ボタンクリックでonConfirmが呼ばれる", () => {
	const onConfirm = vi.fn();
	render({
		title: "確認",
		message: "実行しますか？",
		onConfirm,
		onCancel: vi.fn(),
	});
	const button = document.querySelector(
		'[data-testid="confirm-confirm-button"]',
	) as HTMLElement;
	button.click();
	expect(onConfirm).toHaveBeenCalledOnce();
});

test("キャンセルボタンクリックでonCancelが呼ばれる", () => {
	const onCancel = vi.fn();
	render({
		title: "確認",
		message: "実行しますか？",
		onConfirm: vi.fn(),
		onCancel,
	});
	const button = document.querySelector(
		'[data-testid="confirm-cancel-button"]',
	) as HTMLElement;
	button.click();
	expect(onCancel).toHaveBeenCalledOnce();
});

test("オーバーレイクリックでonCancelが呼ばれる", () => {
	const onCancel = vi.fn();
	render({
		title: "確認",
		message: "実行しますか？",
		onConfirm: vi.fn(),
		onCancel,
	});
	const overlay = document.querySelector(
		'[data-testid="confirm-overlay"]',
	) as HTMLElement;
	overlay.click();
	expect(onCancel).toHaveBeenCalledOnce();
});

test("EscキーでonCancelが呼ばれる", () => {
	const onCancel = vi.fn();
	render({
		title: "確認",
		message: "実行しますか？",
		onConfirm: vi.fn(),
		onCancel,
	});
	act(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	});
	expect(onCancel).toHaveBeenCalledOnce();
});

test("カスタムラベルが表示される", () => {
	render({
		title: "確認",
		message: "メッセージ",
		confirmLabel: "はい",
		cancelLabel: "いいえ",
		onConfirm: vi.fn(),
		onCancel: vi.fn(),
	});
	const confirmBtn = document.querySelector(
		'[data-testid="confirm-confirm-button"]',
	);
	const cancelBtn = document.querySelector(
		'[data-testid="confirm-cancel-button"]',
	);
	expect(confirmBtn?.textContent).toBe("はい");
	expect(cancelBtn?.textContent).toBe("いいえ");
});
