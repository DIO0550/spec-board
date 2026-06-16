import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { LabelRegistry } from "@/domains/label-registry";
import type { LabelsResource } from "@/hooks/useLabels";
import { LabelSettingsTab } from "..";

// useLabelMutations は内部で createLabel/updateLabel/deleteLabel を invoke するため、
// rendering テストでは tauri ラッパをまるごとモックして invoke 不発を避ける。
vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    createLabel: vi.fn(),
    updateLabel: vi.fn(),
    deleteLabel: vi.fn(),
    exportLabels: vi.fn(),
    saveFileDialog: vi.fn(),
  };
});

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

const noopReload = async (): Promise<void> => {};

const buildResource = (
  override: Partial<LabelsResource> = {},
): LabelsResource => {
  const labels = override.labels ?? [];
  return {
    labels,
    usageCounts: override.usageCounts ?? {},
    byName: new Map(labels.map((l) => [l.name, l])),
    status: override.status ?? "loaded",
    error: override.error,
    reload: override.reload ?? noopReload,
  };
};

const render = (resource: LabelsResource): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(LabelSettingsTab, {
        resource,
        onLabelUsageClick: () => {},
      }),
    );
  });
};

test("loaded で各ラベル名が描画される", () => {
  render(
    buildResource({
      labels: [{ name: "type:feature" }, { name: "priority:high" }],
    }),
  );
  expect(container?.textContent).toContain("type:feature");
  expect(container?.textContent).toContain("priority:high");
});

test("color が #RRGGBB のラベルはその色がインライン style に付く（マスタ色優先）", () => {
  const html = renderToStaticMarkup(
    createElement(LabelSettingsTab, {
      resource: buildResource({
        labels: [{ name: "custom", color: "#FF8800" }],
      }),
      onLabelUsageClick: () => {},
    }),
  );
  expect(html).toContain("#FF8800");
});

test("color 無し・group ありは tokensForGroup の oklch が付く", () => {
  const { bg } = LabelRegistry.tokensForGroup("type");
  const html = renderToStaticMarkup(
    createElement(LabelSettingsTab, {
      resource: buildResource({
        labels: [{ name: "feature", group: "type" }],
      }),
      onLabelUsageClick: () => {},
    }),
  );
  expect(html).toContain(bg);
});

test("color も group も無しは tokensForLabel(name) の oklch が付く", () => {
  const { bg } = LabelRegistry.tokensForLabel("priority:high");
  const html = renderToStaticMarkup(
    createElement(LabelSettingsTab, {
      resource: buildResource({ labels: [{ name: "priority:high" }] }),
      onLabelUsageClick: () => {},
    }),
  );
  expect(html).toContain(bg);
});

test("group は name の prefix より優先される", () => {
  const groupBg = LabelRegistry.tokensForGroup("type").bg;
  const html = renderToStaticMarkup(
    createElement(LabelSettingsTab, {
      resource: buildResource({
        labels: [{ name: "priority:high", group: "type" }],
      }),
      onLabelUsageClick: () => {},
    }),
  );
  expect(html).toContain(groupBg);
});

test("loaded で labels が空のときフィルタバーは描画されるが行は無い", () => {
  render(buildResource({ labels: [] }));
  // 統計ヘッダーは描画される
  expect(container?.textContent).toContain("0 件");
  // 行は無い
  const rows = container?.querySelectorAll('[data-testid="label-row"]');
  expect(rows?.length ?? 0).toBe(0);
});

test("error のときインライン文言が表示される", () => {
  render(buildResource({ status: "error" }));
  expect(container?.textContent).toContain("読み込めませんでした");
});

test("loading のとき読み込み中表示になる", () => {
  render(buildResource({ status: "loading" }));
  expect(container?.textContent).toContain("読み込み中");
});

test("idle（プロジェクト未オープン）のとき専用文言を表示する", () => {
  render(buildResource({ status: "idle" }));
  expect(container?.textContent).toContain("プロジェクトを開く");
  expect(container?.textContent).not.toContain("読み込み中");
});

test("usageCount=0 は非リンク、>0 は『N 件』リンク", () => {
  render(
    buildResource({
      labels: [{ name: "bug" }, { name: "wontfix" }],
      usageCounts: { bug: 8 },
    }),
  );
  const link = container?.querySelector('[data-testid="label-usage-link"]');
  expect(link?.textContent).toContain("8");
  // wontfix 行に対応する「0 件」テキストがある（リンクではない）
  expect(container?.textContent).toContain("0 件");
});

test("updated 無しは『新規』表示", () => {
  render(buildResource({ labels: [{ name: "needs-triage" }] }));
  expect(container?.textContent).toContain("新規");
});
