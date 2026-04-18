import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { HeaderBar } from "..";

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

function renderHeaderBar(props: Partial<Parameters<typeof HeaderBar>[0]> = {}) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(
			createElement(HeaderBar, {
				onSettingsClick: vi.fn(),
				onOpenClick: vi.fn(),
				...props,
			}),
		);
	});
	return root;
}

test("プロジェクト名が表示される", async () => {
	renderHeaderBar({ projectName: "My Project" });
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("My Project");
	});
});

test("未選択時はデフォルト名「spec-board」が表示される", async () => {
	renderHeaderBar();
	await vi.waitFor(() => {
		expect(container?.textContent).toContain("spec-board");
	});
});

test("設定ボタンと「開く」ボタンが表示される", async () => {
	renderHeaderBar();
	await vi.waitFor(() => {
		const buttons = container?.querySelectorAll("button") ?? [];
		const texts = Array.from(buttons).map((b) => b.textContent);
		expect(texts).toContain("設定");
		expect(texts).toContain("開く");
	});
});

test("設定ボタンクリックでコールバックが呼ばれる", async () => {
	const onSettingsClick = vi.fn();
	renderHeaderBar({ onSettingsClick });
	let btn: HTMLButtonElement | undefined;
	await vi.waitFor(() => {
		btn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b): b is HTMLButtonElement => b.textContent === "設定",
		);
		expect(btn).toBeDefined();
	});
	btn?.click();
	expect(onSettingsClick).toHaveBeenCalledTimes(1);
});

test("「開く」ボタンクリックでコールバックが呼ばれる", async () => {
	const onOpenClick = vi.fn();
	renderHeaderBar({ onOpenClick });
	let btn: HTMLButtonElement | undefined;
	await vi.waitFor(() => {
		btn = Array.from(container?.querySelectorAll("button") ?? []).find(
			(b): b is HTMLButtonElement => b.textContent === "開く",
		);
		expect(btn).toBeDefined();
	});
	btn?.click();
	expect(onOpenClick).toHaveBeenCalledTimes(1);
});
