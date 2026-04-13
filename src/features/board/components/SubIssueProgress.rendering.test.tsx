import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import type { Task } from "../../../types/task";
import { SubIssueProgress } from "./SubIssueProgress";

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

function render(props: Parameters<typeof SubIssueProgress>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(SubIssueProgress, props));
	});
}

test("children が存在する場合、進捗バーが表示される", () => {
	render({
		childTasks: [createTask({ id: "c1", status: "Todo" })],
		doneColumn: "Done",
	});
	const progressBar = container?.querySelector("[role='progressbar']");
	expect(progressBar).toBeTruthy();
});

test("完了数/全数が正しい割合で表示される", () => {
	render({
		childTasks: [
			createTask({ id: "c1", status: "Done" }),
			createTask({ id: "c2", status: "Todo" }),
			createTask({ id: "c3", status: "Done" }),
			createTask({ id: "c4", status: "In Progress" }),
			createTask({ id: "c5", status: "Todo" }),
		],
		doneColumn: "Done",
	});
	expect(container?.textContent).toContain("2/5");
});

test("▶ クリックで子タスクリストが展開される", () => {
	render({
		childTasks: [
			createTask({ id: "c1", title: "タスクA", status: "Todo" }),
			createTask({ id: "c2", title: "タスクB", status: "Done" }),
		],
		doneColumn: "Done",
	});
	const details = container?.querySelector("details") as HTMLDetailsElement;
	expect(details.open).toBe(false);

	const summary = details.querySelector("summary") as HTMLElement;
	act(() => {
		summary.click();
	});

	expect(details.open).toBe(true);
	expect(container?.textContent).toContain("タスクA");
	expect(container?.textContent).toContain("タスクB");
});

test("children が空配列で非表示", () => {
	render({ childTasks: [], doneColumn: "Done" });
	expect(container?.innerHTML).toBe("");
});

test("全子タスクが完了の場合、バーが 100% になる", () => {
	render({
		childTasks: [
			createTask({ id: "c1", status: "Done" }),
			createTask({ id: "c2", status: "Done" }),
			createTask({ id: "c3", status: "Done" }),
		],
		doneColumn: "Done",
	});
	const progressBar = container?.querySelector(
		"[role='progressbar']",
	) as HTMLElement;
	expect(progressBar.getAttribute("aria-valuenow")).toBe("100");
	expect(container?.textContent).toContain("3/3");
});
