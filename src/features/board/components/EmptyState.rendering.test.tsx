import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { EmptyState } from "./EmptyState";

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

function render(props: Parameters<typeof EmptyState>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(EmptyState, props));
	});
}

test("projectPath が null の場合、「プロジェクトを開く」ボタンが表示される", async () => {
	render({ type: "no-project", onOpenProject: vi.fn() });
	await vi.waitFor(() => {
		const btn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b): b is HTMLButtonElement => b.textContent === "プロジェクトを開く",
		);
		expect(btn).toBeDefined();
	});
});

test("tasks が空配列の場合、ガイドメッセージが表示される", async () => {
	render({ type: "empty-project" });
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("タスクがありません");
		expect(container?.textContent).toContain("追加");
	});
});

test("「プロジェクトを開く」ボタンクリックでコールバックが呼ばれる", async () => {
	const onOpenProject = vi.fn();
	render({ type: "no-project", onOpenProject });
	let btn: HTMLButtonElement | undefined;
	await vi.waitFor(() => {
		btn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b): b is HTMLButtonElement => b.textContent === "プロジェクトを開く",
		);
		expect(btn).toBeDefined();
	});
	btn?.click();
	expect(onOpenProject).toHaveBeenCalledTimes(1);
});
