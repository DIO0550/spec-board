import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "../../../types/task";
import { DetailPanel } from "./DetailPanel";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

/** テスト用カラム一覧 */
const testColumns = [
	{ name: "Todo", order: 0 },
	{ name: "In Progress", order: 1 },
	{ name: "Done", order: 2 },
];

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	root = null;
	container?.remove();
	container = null;
});

/**
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function createTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "テストタスク",
		status: "Todo",
		labels: [],
		links: [],
		children: [],
		reverseLinks: [],
		body: "タスクの本文",
		filePath: "tasks/test.md",
		...overrides,
	};
}

/**
 * DetailPanel をレンダリングするヘルパー
 * @param props - DetailPanel に渡す props
 */
function render(props: Parameters<typeof DetailPanel>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(DetailPanel, props));
	});
}

test("タスク選択時にパネルが表示される", async () => {
	render({
		task: createTask(),
		columns: testColumns,
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
	});
	await vi.waitFor(() => {
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).toBeTruthy();
	});
});

test("タスクタイトルが表示される", async () => {
	render({
		task: createTask({ title: "ログイン修正" }),
		columns: testColumns,
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
	});
	await vi.waitFor(() => {
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("ログイン修正");
	});
});

test("×ボタンクリックでonCloseが呼ばれる", async () => {
	const onClose = vi.fn();
	render({
		task: createTask(),
		columns: testColumns,
		onClose,
		onTaskUpdate: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[aria-label="閉じる"]')).toBeTruthy();
	});
	const closeButton = document.querySelector(
		'[aria-label="閉じる"]',
	) as HTMLElement;
	closeButton.click();
	expect(onClose).toHaveBeenCalledOnce();
});

test("Escキーでパネルが閉じる", async () => {
	const onClose = vi.fn();
	render({
		task: createTask(),
		columns: testColumns,
		onClose,
		onTaskUpdate: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[role="dialog"]')).toBeTruthy();
	});
	act(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	});
	expect(onClose).toHaveBeenCalledOnce();
});

test("ラベル追加でonTaskUpdateが呼ばれる", async () => {
	const onTaskUpdate = vi.fn();
	render({
		task: createTask({ id: "t1", labels: ["existing"] }),
		columns: testColumns,
		onClose: vi.fn(),
		onTaskUpdate,
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
	expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
		labels: ["existing", "new-label"],
	});
});

test("ラベル削除でonTaskUpdateが呼ばれる", async () => {
	const onTaskUpdate = vi.fn();
	render({
		task: createTask({ id: "t1", labels: ["bug", "frontend"] }),
		columns: testColumns,
		onClose: vi.fn(),
		onTaskUpdate,
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
	expect(onTaskUpdate).toHaveBeenCalledWith("t1", {
		labels: ["frontend"],
	});
});

test("オーバーレイクリックでパネルが閉じる", async () => {
	const onClose = vi.fn();
	render({
		task: createTask(),
		columns: testColumns,
		onClose,
		onTaskUpdate: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="detail-overlay"]'),
		).toBeTruthy();
	});
	const overlay = document.querySelector(
		'[data-testid="detail-overlay"]',
	) as HTMLElement;
	overlay.click();
	expect(onClose).toHaveBeenCalledOnce();
});
