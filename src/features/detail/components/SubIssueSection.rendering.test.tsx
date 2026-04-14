import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "../../../types/task";
import { SubIssueSection } from "./SubIssueSection";

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
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
function createTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "child-1",
		title: "子タスク",
		status: "Todo",
		labels: [],
		links: [],
		children: [],
		reverseLinks: [],
		body: "",
		filePath: "tasks/child.md",
		...overrides,
	};
}

/**
 * SubIssueSection をレンダリングするヘルパー
 * @param props - SubIssueSection に渡す props
 */
function render(props: Parameters<typeof SubIssueSection>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(SubIssueSection, props));
	});
}

test("childrenがある場合、進捗バーと子タスク一覧が表示される", async () => {
	const children = [
		createTask({ id: "c1", title: "子タスク1", status: "Todo" }),
		createTask({ id: "c2", title: "子タスク2", status: "Done" }),
	];
	render({
		childTasks: children,
		doneColumn: "Done",
		onTaskSelect: vi.fn(),
		onAddSubIssue: vi.fn(),
	});
	await vi.waitFor(() => {
		const section = document.querySelector('[data-testid="sub-issue-section"]');
		expect(section).toBeTruthy();
		expect(section?.textContent).toContain("子タスク1");
		expect(section?.textContent).toContain("子タスク2");
		const progressbar = section?.querySelector('[role="progressbar"]');
		expect(progressbar).toBeTruthy();
		expect(progressbar?.getAttribute("aria-valuenow")).toBe("50");
	});
});

test("子タスククリックでonTaskSelectが呼ばれる", async () => {
	const onTaskSelect = vi.fn();
	render({
		childTasks: [createTask({ id: "c1", title: "子タスク1" })],
		doneColumn: "Done",
		onTaskSelect,
		onAddSubIssue: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[data-testid="sub-issue-section"]'),
		).toBeTruthy();
	});
	const button = document
		.querySelector('[data-testid="sub-issue-section"]')
		?.querySelector("button:not([data-testid])") as HTMLElement;
	act(() => {
		button.click();
	});
	expect(onTaskSelect).toHaveBeenCalledWith("c1");
});

test("childrenが空でサブIssueセクション非表示", () => {
	render({
		childTasks: [],
		doneColumn: "Done",
		onTaskSelect: vi.fn(),
		onAddSubIssue: vi.fn(),
	});
	expect(
		document.querySelector('[data-testid="sub-issue-section"]'),
	).toBeNull();
});
