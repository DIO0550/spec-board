import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Column, Task } from "@/types/task";
import { TaskForm } from "..";

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

const COLUMNS: Column[] = [
	{ name: "Todo", order: 0 },
	{ name: "In Progress", order: 1 },
	{ name: "Done", order: 2 },
];

/**
 * TaskForm をレンダリングするヘルパー
 * @param props - TaskForm に渡す props
 */
function render(props: Parameters<typeof TaskForm>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(TaskForm, props));
	});
}

/**
 * 指定した input/textarea の value を変更して input イベントを発火する
 * （React の onChange は text input/textarea の input イベントで発火するため）
 * @param el - 対象要素
 * @param value - 設定する値
 */
function changeValue(
	el: HTMLInputElement | HTMLTextAreaElement,
	value: string,
) {
	const setter =
		el instanceof HTMLTextAreaElement
			? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
					?.set
			: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
					?.set;
	setter?.call(el, value);
	el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * 指定した select の value を変更して change イベントを発火する
 * @param el - 対象要素
 * @param value - 設定する値
 */
function changeSelect(el: HTMLSelectElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLSelectElement.prototype,
		"value",
	)?.set;
	setter?.call(el, value);
	el.dispatchEvent(new Event("change", { bubbles: true }));
}

test("全フィールドが表示される", () => {
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
	});
	expect(
		document.querySelector('[data-testid="task-form-title"]'),
	).toBeTruthy();
	expect(
		document.querySelector('[data-testid="task-form-status"]'),
	).toBeTruthy();
	expect(
		document.querySelector('[data-testid="task-form-priority"]'),
	).toBeTruthy();
	expect(
		document.querySelector('[data-testid="task-form-label-input"]'),
	).toBeTruthy();
	expect(document.querySelector('[data-testid="task-form-body"]')).toBeTruthy();
});

test("ステータスの初期値が initialStatus に設定される", () => {
	render({
		columns: COLUMNS,
		initialStatus: "In Progress",
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
	});
	const select = document.querySelector(
		'[data-testid="task-form-status"]',
	) as HTMLSelectElement;
	expect(select.value).toBe("In Progress");
});

test("タイトル入力して送信すると onSubmit が呼ばれる", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "新しいタスク");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit).toHaveBeenCalledOnce();
	expect(onSubmit.mock.calls[0][0]).toMatchObject({
		title: "新しいタスク",
		status: "Todo",
		priority: undefined,
		labels: [],
		body: "",
	});
});

test("タイトル空で送信するとバリデーションエラーが表示され onSubmit は呼ばれない", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	const error = document.querySelector('[data-testid="task-form-title-error"]');
	expect(error).toBeTruthy();
	expect(error?.textContent).toContain("タイトル");
	expect(onSubmit).not.toHaveBeenCalled();
});

test("タイトルが空白のみの場合もバリデーションエラー", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "   ");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(
		document.querySelector('[data-testid="task-form-title-error"]'),
	).toBeTruthy();
	expect(onSubmit).not.toHaveBeenCalled();
});

test("優先度なしのまま送信で priority が undefined", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "T");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit.mock.calls[0][0].priority).toBeUndefined();
});

test("優先度を選択すると送信値に反映される", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	const priority = document.querySelector(
		'[data-testid="task-form-priority"]',
	) as HTMLSelectElement;
	act(() => {
		changeValue(title, "T");
		changeSelect(priority, "High");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit.mock.calls[0][0].priority).toBe("High");
});

test("ラベルを Enter で追加・×で削除できる", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const labelInput = document.querySelector(
		'[data-testid="task-form-label-input"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(labelInput, "bug");
	});
	act(() => {
		labelInput.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});
	expect(document.body.textContent).toContain("bug");

	act(() => {
		changeValue(labelInput, "urgent");
	});
	act(() => {
		labelInput.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
		);
	});

	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "T");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit.mock.calls[0][0].labels).toEqual(["bug", "urgent"]);
});

test("説明を空のまま送信できる", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "T");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit).toHaveBeenCalledOnce();
	expect(onSubmit.mock.calls[0][0].body).toBe("");
});

test("キャンセルボタンで onCancel が呼ばれる", () => {
	const onCancel = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit: vi.fn(),
		onCancel,
	});
	const cancel = document.querySelector(
		'[data-testid="task-form-cancel"]',
	) as HTMLButtonElement;
	act(() => {
		cancel.click();
	});
	expect(onCancel).toHaveBeenCalledOnce();
});

test("isSubmitting 中は送信ボタンと入力欄が無効化される", () => {
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		isSubmitting: true,
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
	});
	const submit = document.querySelector(
		'[data-testid="task-form-submit"]',
	) as HTMLButtonElement;
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	expect(submit.disabled).toBe(true);
	expect(title.disabled).toBe(true);
});

/**
 * 親タスク候補のテストデータ
 */
const PARENT_CANDIDATES: Task[] = [
	{
		id: "p-1",
		title: "親タスクA",
		status: "Todo",
		labels: [],
		links: [],
		children: [],
		reverseLinks: [],
		body: "",
		filePath: "tasks/parent-a.md",
	},
];

test("parentCandidates 未指定なら親タスクフィールドは表示されない", () => {
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
	});
	expect(
		document.querySelector('[data-testid="parent-task-select"]'),
	).toBeNull();
});

test("parentCandidates 指定で親タスク選択UIが表示される", () => {
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		parentCandidates: PARENT_CANDIDATES,
		onSubmit: vi.fn(),
		onCancel: vi.fn(),
	});
	expect(
		document.querySelector('[data-testid="parent-task-select"]'),
	).toBeTruthy();
});

test("initialParent 指定で送信時に parent がフォーム値に含まれる", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		parentCandidates: PARENT_CANDIDATES,
		initialParent: "tasks/parent-a.md",
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "子タスク");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit.mock.calls[0][0].parent).toBe("tasks/parent-a.md");
});

test("親タスク未選択で送信すると parent は undefined", () => {
	const onSubmit = vi.fn();
	render({
		columns: COLUMNS,
		initialStatus: "Todo",
		parentCandidates: PARENT_CANDIDATES,
		onSubmit,
		onCancel: vi.fn(),
	});
	const title = document.querySelector(
		'[data-testid="task-form-title"]',
	) as HTMLInputElement;
	act(() => {
		changeValue(title, "T");
	});
	const form = document.querySelector(
		'[data-testid="task-form"]',
	) as HTMLFormElement;
	act(() => {
		form.dispatchEvent(
			new Event("submit", { bubbles: true, cancelable: true }),
		);
	});
	expect(onSubmit.mock.calls[0][0].parent).toBeUndefined();
});
