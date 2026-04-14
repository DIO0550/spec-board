import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "../../../types/task";
import type { ResolvedLink } from "./LinkSection";
import { LinkSection } from "./LinkSection";

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
		id: "linked-1",
		title: "リンクタスク",
		status: "Todo",
		labels: [],
		links: [],
		children: [],
		reverseLinks: [],
		body: "",
		filePath: "tasks/linked.md",
		...overrides,
	};
}

/**
 * LinkSection をレンダリングするヘルパー
 * @param props - LinkSection に渡す props
 */
function render(props: Parameters<typeof LinkSection>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(LinkSection, props));
	});
}

test("linksがある場合、関連リンクが表示される", async () => {
	const links: ResolvedLink[] = [
		{ filePath: "tasks/a.md", task: createTask({ id: "a", title: "タスクA" }) },
	];
	render({
		links,
		reverseLinks: [],
		onTaskSelect: vi.fn(),
		onRemoveLink: vi.fn(),
		onAddLink: vi.fn(),
	});
	await vi.waitFor(() => {
		const section = document.querySelector('[data-testid="link-section"]');
		expect(section).toBeTruthy();
		expect(section?.textContent).toContain("タスクA");
	});
});

test("reverseLinksがある場合、関連リンクが表示される", async () => {
	const reverseLinks: ResolvedLink[] = [
		{ filePath: "tasks/b.md", task: createTask({ id: "b", title: "タスクB" }) },
	];
	render({
		links: [],
		reverseLinks,
		onTaskSelect: vi.fn(),
		onRemoveLink: vi.fn(),
		onAddLink: vi.fn(),
	});
	await vi.waitFor(() => {
		const section = document.querySelector('[data-testid="link-section"]');
		expect(section).toBeTruthy();
		expect(section?.textContent).toContain("タスクB");
	});
});

test("リンククリックでonTaskSelectが呼ばれる", async () => {
	const onTaskSelect = vi.fn();
	const links: ResolvedLink[] = [
		{
			filePath: "tasks/a.md",
			task: createTask({ id: "link-a", title: "タスクA" }),
		},
	];
	render({
		links,
		reverseLinks: [],
		onTaskSelect,
		onRemoveLink: vi.fn(),
		onAddLink: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(document.querySelector('[data-testid="link-section"]')).toBeTruthy();
	});
	const button = document
		.querySelector('[data-testid="link-section"] ul')
		?.querySelector("button") as HTMLElement;
	act(() => {
		button.click();
	});
	expect(onTaskSelect).toHaveBeenCalledWith("link-a");
});

test("linksとreverseLinksが共に空で関連リンクセクション非表示", () => {
	render({
		links: [],
		reverseLinks: [],
		onTaskSelect: vi.fn(),
		onRemoveLink: vi.fn(),
		onAddLink: vi.fn(),
	});
	expect(document.querySelector('[data-testid="link-section"]')).toBeNull();
});

test("リンク切れの場合は警告アイコンが表示される", async () => {
	const links: ResolvedLink[] = [
		{ filePath: "tasks/broken.md", task: undefined },
	];
	render({
		links,
		reverseLinks: [],
		onTaskSelect: vi.fn(),
		onRemoveLink: vi.fn(),
		onAddLink: vi.fn(),
	});
	await vi.waitFor(() => {
		const section = document.querySelector('[data-testid="link-section"]');
		expect(section).toBeTruthy();
		const warning = section?.querySelector('[aria-label="リンク切れ"]');
		expect(warning).toBeTruthy();
		expect(section?.textContent).toContain("tasks/broken.md");
	});
});

test("リンク削除ボタンでonRemoveLinkが呼ばれる", async () => {
	const onRemoveLink = vi.fn();
	const links: ResolvedLink[] = [
		{
			filePath: "tasks/a.md",
			task: createTask({ id: "a", title: "タスクA" }),
		},
	];
	render({
		links,
		reverseLinks: [],
		onTaskSelect: vi.fn(),
		onRemoveLink,
		onAddLink: vi.fn(),
	});
	await vi.waitFor(() => {
		expect(
			document.querySelector('[aria-label="リンク「タスクA」を削除"]'),
		).toBeTruthy();
	});
	const removeButton = document.querySelector(
		'[aria-label="リンク「タスクA」を削除"]',
	) as HTMLElement;
	act(() => {
		removeButton.click();
	});
	expect(onRemoveLink).toHaveBeenCalledWith("tasks/a.md");
});
