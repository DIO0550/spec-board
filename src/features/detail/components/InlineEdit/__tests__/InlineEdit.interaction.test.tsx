import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { InlineEdit } from "..";

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
 * InlineEdit をレンダリングするヘルパー
 * @param props - InlineEdit に渡す props
 */
function render(props: Parameters<typeof InlineEdit>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(InlineEdit, props));
	});
}

test("初期表示でテキストが表示される", () => {
	render({ value: "タスクタイトル", onConfirm: vi.fn() });
	const display = document.querySelector('[data-testid="inline-edit-display"]');
	expect(display?.textContent).toBe("タスクタイトル");
});

test("クリックで編集モードになる", () => {
	render({ value: "タスクタイトル", onConfirm: vi.fn() });
	const display = document.querySelector(
		'[data-testid="inline-edit-display"]',
	) as HTMLElement;
	act(() => {
		display.click();
	});
	const input = document.querySelector(
		'[data-testid="inline-edit-input"]',
	) as HTMLInputElement;
	expect(input).toBeTruthy();
	expect(input.value).toBe("タスクタイトル");
});

test("Enterで確定しonConfirmが呼ばれる", () => {
	const onConfirm = vi.fn();
	render({ value: "元の値", onConfirm });
	const display = document.querySelector(
		'[data-testid="inline-edit-display"]',
	) as HTMLElement;
	act(() => {
		display.click();
	});
	const input = document.querySelector(
		'[data-testid="inline-edit-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "新しい値");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});
	expect(onConfirm).toHaveBeenCalledWith("新しい値");
	expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("Escでキャンセルし元の値に戻る", () => {
	const onConfirm = vi.fn();
	render({ value: "元の値", onConfirm });
	const display = document.querySelector(
		'[data-testid="inline-edit-display"]',
	) as HTMLElement;
	act(() => {
		display.click();
	});
	const input = document.querySelector(
		'[data-testid="inline-edit-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "変更中");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
	});
	expect(onConfirm).not.toHaveBeenCalled();
	const displayAfter = document.querySelector(
		'[data-testid="inline-edit-display"]',
	);
	expect(displayAfter?.textContent).toBe("元の値");
});

test("空文字で確定すると元に戻る", () => {
	const onConfirm = vi.fn();
	render({ value: "元の値", onConfirm });
	const display = document.querySelector(
		'[data-testid="inline-edit-display"]',
	) as HTMLElement;
	act(() => {
		display.click();
	});
	const input = document.querySelector(
		'[data-testid="inline-edit-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});
	expect(onConfirm).not.toHaveBeenCalled();
	const displayAfter = document.querySelector(
		'[data-testid="inline-edit-display"]',
	);
	expect(displayAfter?.textContent).toBe("元の値");
});
