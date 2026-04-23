import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { TaskFormActions } from "..";

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

const renderWith = (...children: React.ReactNode[]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormActions, null, ...children));
  });
};

test("children をそのまま描画する", () => {
  renderWith(
    createElement(
      "button",
      { type: "button", "data-testid": "x" },
      "キャンセル",
    ),
    createElement("button", { type: "submit", "data-testid": "y" }, "作成"),
  );
  const x = container?.querySelector("[data-testid='x']") as HTMLButtonElement;
  const y = container?.querySelector("[data-testid='y']") as HTMLButtonElement;
  expect(x).toBeTruthy();
  expect(x.textContent).toBe("キャンセル");
  expect(y).toBeTruthy();
  expect(y.textContent).toBe("作成");
});

test("ルート div が右寄せレイアウトの class を持つ", () => {
  renderWith(createElement("button", { type: "button" }, "ok"));
  const rootDiv = container?.firstElementChild as HTMLDivElement;
  expect(rootDiv.tagName).toBe("DIV");
  expect(rootDiv.className).toContain("flex");
  expect(rootDiv.className).toContain("justify-end");
});
