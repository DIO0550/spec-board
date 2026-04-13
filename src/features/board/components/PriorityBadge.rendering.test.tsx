import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { PriorityBadge } from "./PriorityBadge";

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

function render(props: Parameters<typeof PriorityBadge>[0]) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(createElement(PriorityBadge, props));
	});
}

test("priority が High の場合、赤いバッジが表示される", async () => {
	render({ priority: "High" });
	await vi.waitFor(() => {
		const badge = container?.querySelector("span");
		expect(badge).toBeTruthy();
		expect(badge?.textContent).toBe("High");
		expect(badge?.className).toContain("bg-red-100");
		expect(badge?.className).toContain("text-red-800");
	});
});

test("priority が Medium の場合、黄色いバッジが表示される", async () => {
	render({ priority: "Medium" });
	await vi.waitFor(() => {
		const badge = container?.querySelector("span");
		expect(badge).toBeTruthy();
		expect(badge?.textContent).toBe("Medium");
		expect(badge?.className).toContain("bg-yellow-100");
	});
});

test("priority が Low の場合、青いバッジが表示される", async () => {
	render({ priority: "Low" });
	await vi.waitFor(() => {
		const badge = container?.querySelector("span");
		expect(badge).toBeTruthy();
		expect(badge?.textContent).toBe("Low");
		expect(badge?.className).toContain("bg-blue-100");
	});
});

test("priority 未設定でバッジ非表示", async () => {
	render({ priority: undefined });
	await vi.waitFor(() => {
		const badge = container?.querySelector("span");
		expect(badge).toBeNull();
	});
});
