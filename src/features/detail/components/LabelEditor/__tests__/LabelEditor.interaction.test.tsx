import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { LabelEditor } from "..";

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
 * LabelEditor をレンダリングするヘルパー
 * @param props - LabelEditor に渡す props
 */
function render(props: Parameters<typeof LabelEditor>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(LabelEditor, props));
	});
}

test("現在のラベルがタグ表示される", async () => {
	render({
		labels: ["bug", "frontend"],
		onAdd: vi.fn(),
		onRemove: vi.fn(),
	});
	await vi.waitFor(() => {
		const editor = document.querySelector('[data-testid="label-editor"]');
		expect(editor?.textContent).toContain("bug");
		expect(editor?.textContent).toContain("frontend");
	});
});

test("「+ 追加」クリックで入力フィールドが表示される", async () => {
	render({
		labels: [],
		onAdd: vi.fn(),
		onRemove: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="label-add-button"]'),
		).toBeTruthy();
	});
	const addButton = document.querySelector(
		'[data-testid="label-add-button"]',
	) as HTMLElement;
	act(() => {
		addButton.click();
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
	});
});

test("ラベル入力確定でonAddが呼ばれる", async () => {
	const onAdd = vi.fn();
	render({
		labels: [],
		onAdd,
		onRemove: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="label-add-button"]'),
		).toBeTruthy();
	});
	const addButton = document.querySelector(
		'[data-testid="label-add-button"]',
	) as HTMLElement;
	act(() => {
		addButton.click();
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
	});
	const input = document.querySelector(
		'[data-testid="label-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "new-label");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});
	expect(onAdd).toHaveBeenCalledWith("new-label");
});

test("Escapeキーでキャンセルされ、onAddが呼ばれない", async () => {
	const onAdd = vi.fn();
	render({
		labels: [],
		onAdd,
		onRemove: vi.fn(),
	});
	const addButton = document.querySelector(
		'[data-testid="label-add-button"]',
	) as HTMLElement;
	act(() => {
		addButton.click();
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
	});
	const input = document.querySelector(
		'[data-testid="label-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "cancelled-label");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
	});
	expect(onAdd).not.toHaveBeenCalled();
});

test("blurで入力値が確定されonAddが1回だけ呼ばれる", async () => {
	const onAdd = vi.fn();
	render({
		labels: [],
		onAdd,
		onRemove: vi.fn(),
	});
	const addButton = document.querySelector(
		'[data-testid="label-add-button"]',
	) as HTMLElement;
	act(() => {
		addButton.click();
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
	});
	const input = document.querySelector(
		'[data-testid="label-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "blur-label");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.blur();
	});
	expect(onAdd).toHaveBeenCalledTimes(1);
	expect(onAdd).toHaveBeenCalledWith("blur-label");
});

test("Enter後のblurでonAddが二重呼び出しされない", async () => {
	const onAdd = vi.fn();
	render({
		labels: [],
		onAdd,
		onRemove: vi.fn(),
	});
	const addButton = document.querySelector(
		'[data-testid="label-add-button"]',
	) as HTMLElement;
	act(() => {
		addButton.click();
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="label-input"]')).toBeTruthy();
	});
	const input = document.querySelector(
		'[data-testid="label-input"]',
	) as HTMLInputElement;
	act(() => {
		const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		nativeInputValueSetter?.call(input, "enter-label");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	act(() => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});
	act(() => {
		input.blur();
	});
	expect(onAdd).toHaveBeenCalledTimes(1);
	expect(onAdd).toHaveBeenCalledWith("enter-label");
});

test("タグ×ボタンで該当ラベルが削除される", async () => {
	const onRemove = vi.fn();
	render({
		labels: ["bug", "frontend"],
		onAdd: vi.fn(),
		onRemove,
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[aria-label="ラベル「bug」を削除"]'),
		).toBeTruthy();
	});
	const removeButton = document.querySelector(
		'[aria-label="ラベル「bug」を削除"]',
	) as HTMLElement;
	act(() => {
		removeButton.click();
	});
	expect(onRemove).toHaveBeenCalledWith("bug");
});
