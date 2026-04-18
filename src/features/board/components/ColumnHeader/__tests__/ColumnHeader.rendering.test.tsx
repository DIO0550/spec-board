import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { ColumnHeader } from "..";

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

function render(props: Parameters<typeof ColumnHeader>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(ColumnHeader, props));
	});
}

test("ステータス名が表示される", async () => {
	render({ name: "Todo", taskCount: 3, onAddClick: vi.fn() });
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("Todo");
	});
});

test("タスク件数が表示される", async () => {
	render({ name: "Todo", taskCount: 5, onAddClick: vi.fn() });
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("5");
	});
});

test("「+ 追加」ボタンが表示される", async () => {
	render({ name: "Todo", taskCount: 0, onAddClick: vi.fn() });
	await vi.waitFor(() => {
		const btn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b): b is HTMLButtonElement => b.textContent === "+ 追加",
		);
		expect(btn).toBeDefined();
	});
});

test("「+ 追加」ボタンクリックでコールバックが呼ばれる", async () => {
	const onAddClick = vi.fn();
	render({ name: "Todo", taskCount: 0, onAddClick });
	let btn: HTMLButtonElement | undefined;
	await vi.waitFor(() => {
		btn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b): b is HTMLButtonElement => b.textContent === "+ 追加",
		);
		expect(btn).toBeDefined();
	});
	btn?.click();
	expect(onAddClick).toHaveBeenCalledTimes(1);
});
