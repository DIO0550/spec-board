import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { useRecentProjects } from "../context";

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

/** Provider 外で useRecentProjects を呼ぶ Probe。 */
const OutsideProbe = () => {
  useRecentProjects();
  return null;
};

test("Provider 外で useRecentProjects を呼ぶと専用メッセージで throw する", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // React が render 例外をコンソールに出すのを抑止する。
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    act(() => {
      root?.render(createElement(OutsideProbe));
    });
  }).toThrow(
    "useRecentProjects は RecentProjectsProvider の内側で使用してください",
  );
  spy.mockRestore();
});
