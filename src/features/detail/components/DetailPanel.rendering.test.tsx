import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "../../../types/task";
import { DetailPanel } from "./DetailPanel";

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

function render(props: Parameters<typeof DetailPanel>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(DetailPanel, props));
	});
}

test("タスク選択時にパネルが表示される", async () => {
	render({ task: createTask(), onClose: vi.fn() });
	await vi.waitFor(() => {
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog).toBeTruthy();
	});
});

test("タスクタイトルが表示される", async () => {
	render({ task: createTask({ title: "ログイン修正" }), onClose: vi.fn() });
	await vi.waitFor(() => {
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("ログイン修正");
	});
});

test("×ボタンクリックでonCloseが呼ばれる", async () => {
	const onClose = vi.fn();
	render({ task: createTask(), onClose });
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
	render({ task: createTask(), onClose });
	await vi.waitFor(() => {
		expect(document.querySelector('[role="dialog"]')).toBeTruthy();
	});
	act(() => {
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
	});
	expect(onClose).toHaveBeenCalledOnce();
});

test("オーバーレイクリックでパネルが閉じる", async () => {
	const onClose = vi.fn();
	render({ task: createTask(), onClose });
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
