import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { makeTask, warn } from "@/domains/__tests__/taskFixtures";
import { ParseErrorBanner } from "..";

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
 * ParseErrorBanner をレンダリングするヘルパー。
 * @param props - ParseErrorBanner に渡す props
 */
const render = (props: Parameters<typeof ParseErrorBanner>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ParseErrorBanner, props));
  });
};

const queryBanner = (): Element | null =>
  document.querySelector('[data-testid="parse-error-banner"]');

test("invalid コードを持つ task で role=alert バナーと固定文言が表示される", () => {
  render({
    task: makeTask({ id: "x", warnings: [warn("invalidStatusUsedDefault")] }),
  });
  const banner = queryBanner();
  expect(banner).not.toBeNull();
  expect(banner?.getAttribute("role")).toBe("alert");
  expect(banner?.textContent).toContain(
    "フロントマターに不正な値があります。md ファイルを手動修正してください。",
  );
});

test("warnings 空の task では null（バナーが描画されない）", () => {
  render({ task: makeTask({ id: "x", warnings: [] }) });
  expect(queryBanner()).toBeNull();
});

test("除外コードのみの task では null", () => {
  render({ task: makeTask({ id: "x", warnings: [warn("parentCycle")] }) });
  expect(queryBanner()).toBeNull();
});

test("invalid を複数持つ task でも banner は 1 個のみ（件数列挙なし）", () => {
  render({
    task: makeTask({
      id: "x",
      warnings: [
        warn("invalidStatusUsedDefault"),
        warn("invalidParentIgnored"),
      ],
    }),
  });
  const banners = document.querySelectorAll(
    '[data-testid="parse-error-banner"]',
  );
  expect(banners.length).toBe(1);
  expect(banners[0]?.textContent).toContain(
    "フロントマターに不正な値があります。md ファイルを手動修正してください。",
  );
});
