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

/** テスト用の全タスク一覧 */
const allTestTasks: Task[] = [
	{
		id: "task-1",
		title: "テストタスク",
		status: "Todo",
		labels: [],
		links: [],
		children: [],
		reverseLinks: [],
		body: "タスクの本文",
		filePath: "tasks/test.md",
	},
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
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
	});
	await vi.waitFor(() => {
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).toBeTruthy();
	});
});

test("タスクタイトルが表示される", async () => {
	render({
		task: createTask({ title: "ログイン修正" }),
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
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
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose,
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
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
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose,
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
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
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate,
		onTaskSelect: vi.fn(),
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
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate,
		onTaskSelect: vi.fn(),
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
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose,
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
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

test("親タスクがある場合、親タスク名が表示されクリックで遷移する", async () => {
	const parentTask = createTask({
		id: "parent-1",
		title: "親タスク",
		filePath: "tasks/parent.md",
	});
	const onTaskSelect = vi.fn();
	render({
		task: createTask({ parent: "tasks/parent.md" }),
		allTasks: [parentTask],
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect,
	});
	await vi.waitFor(() => {
		const parentSection = document.querySelector('[data-testid="parent-task"]');
		expect(parentSection).toBeTruthy();
		expect(parentSection?.textContent).toContain("親タスク");
	});
	const parentButton = document
		.querySelector('[data-testid="parent-task"]')
		?.querySelector("button") as HTMLElement;
	act(() => {
		parentButton.click();
	});
	expect(onTaskSelect).toHaveBeenCalledWith("parent-1");
});

test("parentが未設定で親タスク表示なし", async () => {
	render({
		task: createTask({ parent: undefined }),
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[role="dialog"]')).toBeTruthy();
	});
	expect(document.querySelector('[data-testid="parent-task"]')).toBeNull();
});

test("childrenがある場合、サブIssueセクションが表示される", async () => {
	const childTask = createTask({
		id: "child-1",
		title: "子タスク",
		filePath: "tasks/child.md",
		status: "Done",
	});
	render({
		task: createTask({ children: ["tasks/child.md"] }),
		allTasks: [childTask],
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="sub-issue-section"]'),
		).toBeTruthy();
	});
});

test("childrenが空でサブIssueセクション非表示", async () => {
	render({
		task: createTask({ children: [] }),
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[role="dialog"]')).toBeTruthy();
	});
	expect(
		document.querySelector('[data-testid="sub-issue-section"]'),
	).toBeNull();
});

test("linksがある場合、関連リンクセクションが表示される", async () => {
	const linkedTask = createTask({
		id: "linked-1",
		title: "リンクタスク",
		filePath: "tasks/linked.md",
	});
	render({
		task: createTask({ links: ["tasks/linked.md"] }),
		allTasks: [linkedTask],
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="link-section"]')).toBeTruthy();
	});
});

test("linksとreverseLinksが共に空で関連リンクセクション非表示", async () => {
	render({
		task: createTask({ links: [], reverseLinks: [] }),
		allTasks: allTestTasks,
		columns: testColumns,
		doneColumn: "Done",
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onTaskSelect: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[role="dialog"]')).toBeTruthy();
	});
	expect(document.querySelector('[data-testid="link-section"]')).toBeNull();
});
