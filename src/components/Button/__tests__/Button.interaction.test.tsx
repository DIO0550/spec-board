import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Button } from "..";

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

function render(props: Parameters<typeof Button>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(Button, props));
  });
}

test("onClick が click で呼ばれる", async () => {
  const spy = vi.fn();
  render({ variant: "primary", onClick: spy, children: "送信" });
  await vi.waitFor(() => {
    const btn = container?.querySelector("button");
    expect(btn).toBeTruthy();
  });
  const btn = container?.querySelector("button");
  act(() => {
    btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(spy).toHaveBeenCalledTimes(1);
});

test("disabled のとき onClick が呼ばれず disabled クラスが効く", async () => {
  const spy = vi.fn();
  render({ variant: "primary", disabled: true, onClick: spy, children: "x" });
  const btn = container?.querySelector("button") as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  expect(btn.className).toContain("disabled:opacity-50");
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(spy).not.toHaveBeenCalled();
});

test('type="submit" でフォーム送信を発火する', async () => {
  const formSubmit = vi.fn((e: Event) => e.preventDefault());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(
        "form",
        { onSubmit: formSubmit },
        createElement(Button, { variant: "primary", type: "submit" }, "送信"),
      ),
    );
  });
  const btn = container?.querySelector("button") as HTMLButtonElement;
  act(() => {
    btn.click();
  });
  expect(formSubmit).toHaveBeenCalledTimes(1);
});
