import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { LabelRegistry } from "@/domains/label-registry";
import { useLabelList } from "@/features/settings/hooks/useLabelList";
import { LabelSettingsTab } from "..";

vi.mock("@/features/settings/hooks/useLabelList", () => ({
  useLabelList: vi.fn(),
}));

const useLabelListMock = vi.mocked(useLabelList);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  useLabelListMock.mockReset();
});

/**
 * LabelSettingsTab をレンダリングするヘルパー
 */
const render = () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LabelSettingsTab));
  });
};

test("loaded で各ラベル名が描画される", () => {
  useLabelListMock.mockReturnValue({
    kind: "loaded",
    labels: [{ name: "type:feature" }, { name: "priority:high" }],
  });
  render();
  expect(container?.textContent).toContain("type:feature");
  expect(container?.textContent).toContain("priority:high");
});

test("color が #RRGGBB のラベルはその色がインライン style に付く（マスタ色優先）", () => {
  useLabelListMock.mockReturnValue({
    kind: "loaded",
    labels: [{ name: "custom", color: "#FF8800" }],
  });
  const html = renderToStaticMarkup(createElement(LabelSettingsTab));
  expect(html).toContain("#FF8800");
});

test("color 無し・group ありは tokensForGroup の oklch が付く", () => {
  useLabelListMock.mockReturnValue({
    kind: "loaded",
    labels: [{ name: "feature", group: "type" }],
  });
  const { bg } = LabelRegistry.tokensForGroup("type");
  const html = renderToStaticMarkup(createElement(LabelSettingsTab));
  expect(html).toContain(bg);
});

test("color も group も無しは tokensForLabel(name) の oklch が付く", () => {
  useLabelListMock.mockReturnValue({
    kind: "loaded",
    labels: [{ name: "priority:high" }],
  });
  const { bg } = LabelRegistry.tokensForLabel("priority:high");
  const html = renderToStaticMarkup(createElement(LabelSettingsTab));
  expect(html).toContain(bg);
});

test("group は name の prefix より優先される（tokensForGroup ≠ tokensForLabel(name)）", () => {
  useLabelListMock.mockReturnValue({
    kind: "loaded",
    labels: [{ name: "priority:high", group: "type" }],
  });
  const groupBg = LabelRegistry.tokensForGroup("type").bg;
  const nameBg = LabelRegistry.tokensForLabel("priority:high").bg;
  expect(groupBg).not.toBe(nameBg);
  const html = renderToStaticMarkup(createElement(LabelSettingsTab));
  expect(html).toContain(groupBg);
});

test("loaded で labels が空のとき「ラベルなし」相当の表示になる", () => {
  useLabelListMock.mockReturnValue({ kind: "loaded", labels: [] });
  render();
  expect(container?.textContent).toContain("ラベルなし");
});

test("error のときインライン文言が表示される", () => {
  useLabelListMock.mockReturnValue({ kind: "error" });
  render();
  expect(container?.textContent).toContain("読み込めませんでした");
});

test("loading のとき読み込み中表示になる", () => {
  useLabelListMock.mockReturnValue({ kind: "loading" });
  render();
  expect(container?.textContent).toContain("読み込み中");
});
