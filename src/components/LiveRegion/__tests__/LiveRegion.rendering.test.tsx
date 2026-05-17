import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, test } from "vitest";
import { LiveRegion } from "@/components/LiveRegion";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const queryRegion = (): HTMLElement | null =>
  container?.querySelector<HTMLElement>('[data-testid="live-region"]') ?? null;

test("announcement に値があれば role=status / aria-live=polite / aria-atomic=true が付与される", () => {
  act(() => {
    root?.render(
      createElement(LiveRegion, { announcement: { id: 1, text: "x" } }),
    );
  });
  const el = queryRegion();
  expect(el).not.toBeNull();
  expect(el?.getAttribute("role")).toBe("status");
  expect(el?.getAttribute("aria-live")).toBe("polite");
  expect(el?.getAttribute("aria-atomic")).toBe("true");
});

test("announcement.text が textContent に反映される", () => {
  act(() => {
    root?.render(
      createElement(LiveRegion, {
        announcement: { id: 1, text: "「A」を「Done」に移動しました" },
      }),
    );
  });
  const el = queryRegion();
  expect(el?.textContent).toBe("「A」を「Done」に移動しました");
});

test("視覚非表示クラス（sr-only）が付与される", () => {
  act(() => {
    root?.render(
      createElement(LiveRegion, { announcement: { id: 1, text: "x" } }),
    );
  });
  const el = queryRegion();
  expect(el?.className).toContain("sr-only");
});

test("announcement=null でも要素自体は描画されるが空文字", () => {
  act(() => {
    root?.render(createElement(LiveRegion, { announcement: null }));
  });
  const el = queryRegion();
  expect(el).not.toBeNull();
  expect(el?.textContent).toBe("");
});

test("同じ text でも id が変わると div が再 mount される（連続同文言の announce が SR に届く）", () => {
  act(() => {
    root?.render(
      createElement(LiveRegion, { announcement: { id: 1, text: "same" } }),
    );
  });
  const before = queryRegion();
  expect(before?.textContent).toBe("same");
  act(() => {
    root?.render(
      createElement(LiveRegion, { announcement: { id: 2, text: "same" } }),
    );
  });
  const after = queryRegion();
  expect(after?.textContent).toBe("same");
  expect(after).not.toBe(before);
});
