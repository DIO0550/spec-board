import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { PrioritySelect } from "./PrioritySelect";

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
 * PrioritySelect をレンダリングするヘルパー
 * @param props - PrioritySelect に渡す props
 */
function render(props: Parameters<typeof PrioritySelect>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(PrioritySelect, props));
	});
}

test("現在の優先度が選択状態で表示される", () => {
	render({ value: "High", onChange: vi.fn() });
	const select = document.querySelector(
		'[data-testid="priority-select"]',
	) as HTMLSelectElement;
	expect(select.value).toBe("High");
});

test("優先度未設定時は「なし」が選択される", () => {
	render({ value: undefined, onChange: vi.fn() });
	const select = document.querySelector(
		'[data-testid="priority-select"]',
	) as HTMLSelectElement;
	expect(select.value).toBe("");
});

test("優先度変更でonChangeが呼ばれる", () => {
	const onChange = vi.fn();
	render({ value: undefined, onChange });
	const select = document.querySelector(
		'[data-testid="priority-select"]',
	) as HTMLSelectElement;
	act(() => {
		select.value = "Medium";
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
	expect(onChange).toHaveBeenCalledWith("Medium");
});

test("「なし」を選択するとundefinedでonChangeが呼ばれる", () => {
	const onChange = vi.fn();
	render({ value: "High", onChange });
	const select = document.querySelector(
		'[data-testid="priority-select"]',
	) as HTMLSelectElement;
	act(() => {
		select.value = "";
		select.dispatchEvent(new Event("change", { bubbles: true }));
	});
	expect(onChange).toHaveBeenCalledWith(undefined);
});
