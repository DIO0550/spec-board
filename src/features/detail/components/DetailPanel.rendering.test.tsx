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
		onDelete: vi.fn(),
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
		onDelete: vi.fn(),
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
		onDelete: vi.fn(),
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
		onDelete: vi.fn(),
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
		onDelete: vi.fn(),
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
		onDelete: vi.fn(),
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
		onDelete: vi.fn(),
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

test("本文がMarkdownとしてレンダリングされる", async () => {
	render({
		task: createTask({ body: "# 見出し\n- リスト項目" }),
		columns: testColumns,
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onDelete: vi.fn(),
	});
	await vi.waitFor(() => {
		const panel = document.querySelector('[role="dialog"]');
		expect(panel?.querySelector("h1")).toBeTruthy();
		expect(panel?.querySelector("h1")?.textContent).toBe("見出し");
		expect(panel?.querySelector("li")).toBeTruthy();
		expect(panel?.querySelector("li")?.textContent).toBe("リスト項目");
	});
});

test("allTasks から子タスクを解決してサブIssue 進捗を表示する", async () => {
	const parent = createTask({
		id: "parent",
		title: "親",
		filePath: "tasks/parent.md",
	});
	const child1 = createTask({
		id: "child-1",
		title: "子1",
		status: "Done",
		filePath: "tasks/child-1.md",
		parent: "tasks/parent.md",
	});
	const child2 = createTask({
		id: "child-2",
		title: "子2",
		status: "Todo",
		filePath: "tasks/child-2.md",
		parent: "tasks/parent.md",
	});
	const unrelated = createTask({
		id: "other",
		title: "別タスク",
		filePath: "tasks/other.md",
	});
	render({
		task: parent,
		columns: testColumns,
		allTasks: [parent, child1, child2, unrelated],
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onDelete: vi.fn(),
		onAddSubIssue: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="sub-issue-section"]'),
		).toBeTruthy();
	});
	const section = document.querySelector(
		'[data-testid="sub-issue-section"]',
	) as HTMLElement;
	expect(section.textContent).toContain("サブIssue (1/2)");
	expect(
		document.querySelector('[data-testid="sub-issue-item-child-1"]'),
	).toBeTruthy();
	expect(
		document.querySelector('[data-testid="sub-issue-item-child-2"]'),
	).toBeTruthy();
	expect(
		document.querySelector('[data-testid="sub-issue-item-other"]'),
	).toBeNull();
});

test("サブIssue 追加ボタンクリックで onAddSubIssue が親のファイルパス付きで呼ばれる", async () => {
	const onAddSubIssue = vi.fn();
	const parent = createTask({
		id: "parent",
		title: "親",
		filePath: "tasks/parent.md",
	});
	render({
		task: parent,
		columns: testColumns,
		allTasks: [parent],
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onDelete: vi.fn(),
		onAddSubIssue,
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="sub-issue-add-button"]'),
		).toBeTruthy();
	});
	const addButton = document.querySelector(
		'[data-testid="sub-issue-add-button"]',
	) as HTMLElement;
	act(() => {
		addButton.click();
	});
	expect(onAddSubIssue).toHaveBeenCalledWith("tasks/parent.md");
});

test("allTasks 未指定のときサブIssue セクションは表示されない", async () => {
	render({
		task: createTask({ filePath: "tasks/parent.md" }),
		columns: testColumns,
		onClose: vi.fn(),
		onTaskUpdate: vi.fn(),
		onDelete: vi.fn(),
		onAddSubIssue: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[role="dialog"]')).toBeTruthy();
	});
	expect(
		document.querySelector('[data-testid="sub-issue-section"]'),
	).toBeNull();
});
