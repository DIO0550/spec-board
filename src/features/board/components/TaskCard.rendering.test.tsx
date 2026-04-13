import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "../../../types/task";
import { TaskCard } from "./TaskCard";

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
		body: "",
		filePath: "tasks/test.md",
		...overrides,
	};
}

function render(props: Parameters<typeof TaskCard>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(TaskCard, props));
	});
}

test("タイトルが表示される", async () => {
	render({ task: createTask({ title: "ログイン修正" }), onClick: vi.fn() });
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("ログイン修正");
	});
});

test("カードクリックでonClickが呼ばれる", async () => {
	const onClick = vi.fn();
	render({ task: createTask({ id: "task-42" }), onClick });
	await vi.waitFor(() => {
		expect(container?.querySelector("button")).toBeTruthy();
	});
	const button = container?.querySelector("button") as HTMLButtonElement;
	button.click();
	expect(onClick).toHaveBeenCalledWith("task-42");
});

test("onClick未指定の場合、divで描画されボタンにならない", async () => {
	render({ task: createTask({ title: "非インタラクティブ" }) });
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("非インタラクティブ");
	});
	const button = container?.querySelector("button");
	expect(button).toBeNull();
	const div = container?.querySelector("div");
	expect(div).toBeTruthy();
});

test("titleが未設定の場合、filePathが表示される", async () => {
	render({
		task: createTask({ title: "", filePath: "tasks/my-task.md" }),
		onClick: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("tasks/my-task.md");
	});
});

test("priority が High の場合、赤いバッジが表示される", async () => {
	render({ task: createTask({ priority: "High" }), onClick: vi.fn() });
	await vi.waitFor(() => {
		const badge = container?.querySelector("span.bg-red-100");
		expect(badge).toBeTruthy();
		expect(badge?.textContent).toBe("High");
	});
});

test("labels が ['bug', 'frontend'] の場合、2つのタグが表示される", async () => {
	render({
		task: createTask({ labels: ["bug", "frontend"] }),
		onClick: vi.fn(),
	});
	await vi.waitFor(() => {
		const tags = container?.querySelectorAll(".bg-gray-100");
		expect(tags?.length).toBe(2);
		expect(tags?.[0]?.textContent).toBe("bug");
		expect(tags?.[1]?.textContent).toBe("frontend");
	});
});

test("priority 未設定でバッジ非表示", async () => {
	render({ task: createTask({ priority: undefined }), onClick: vi.fn() });
	await vi.waitFor(() => {
		const badge = container?.querySelector(
			".bg-red-100, .bg-yellow-100, .bg-blue-100",
		);
		expect(badge).toBeNull();
	});
});

test("labels が空配列でタグ領域非表示", async () => {
	render({ task: createTask({ labels: [] }), onClick: vi.fn() });
	await vi.waitFor(() => {
		const tagContainer = container?.querySelector(".flex-wrap");
		expect(tagContainer).toBeNull();
	});
});

test("ラベルが5個以上で折り返し表示", async () => {
	render({
		task: createTask({
			labels: ["bug", "frontend", "urgent", "design", "refactor"],
		}),
		onClick: vi.fn(),
	});
	await vi.waitFor(() => {
		const tags = container?.querySelectorAll(".bg-gray-100");
		expect(tags?.length).toBe(5);
		const wrapper = container?.querySelector(".flex-wrap");
		expect(wrapper).toBeTruthy();
	});
});
