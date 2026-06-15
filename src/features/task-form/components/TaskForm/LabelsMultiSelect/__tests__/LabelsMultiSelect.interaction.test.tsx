import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { LabelDefinition } from "@/lib/tauri";
import { LabelsMultiSelect } from "..";

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

const SUGGESTIONS: LabelDefinition[] = [
  { name: "bug", color: "#e11d48" },
  { name: "feature", color: "#16a34a" },
  { name: "docs" },
];

const baseProps = (
  overrides: Partial<Parameters<typeof LabelsMultiSelect>[0]> = {},
): Parameters<typeof LabelsMultiSelect>[0] => ({
  label: "ラベル",
  selected: [],
  suggestions: SUGGESTIONS,
  onToggle: vi.fn(),
  disabled: false,
  "data-testid": "lbl",
  ...overrides,
});

const render = (props: Parameters<typeof LabelsMultiSelect>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LabelsMultiSelect, props));
  });
};

const trigger = (): HTMLButtonElement =>
  document.querySelector('[data-testid="lbl"]') as HTMLButtonElement;

const openPopover = () => {
  act(() => {
    trigger().click();
  });
};

const typeSearch = (value: string) => {
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(search, value);
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

test("未選択時は trigger にプレースホルダ、選択時は chips を表示する", () => {
  render(baseProps({ selected: [] }));
  expect(trigger().textContent).toContain("ラベルを選択…");
  act(() => {
    root?.render(
      createElement(
        LabelsMultiSelect,
        baseProps({ selected: ["bug", "docs"] }),
      ),
    );
  });
  expect(trigger().textContent).toContain("bug");
  expect(trigger().textContent).toContain("docs");
});

test("trigger は aria-haspopup を持ち、開くと候補 option が並ぶ", () => {
  render(baseProps());
  expect(trigger().getAttribute("aria-haspopup")).toBe("true");
  openPopover();
  expect(document.querySelector('[data-testid="lbl-popover"]')).toBeTruthy();
  const options = Array.from(
    document.querySelectorAll('[data-testid^="lbl-option-"]'),
  );
  expect(options.map((o) => o.textContent)).toEqual(["bug", "feature", "docs"]);
});

test("選択済み option は aria-pressed=true になる", () => {
  render(baseProps({ selected: ["feature"] }));
  openPopover();
  expect(
    document
      .querySelector('[data-testid="lbl-option-feature"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    document
      .querySelector('[data-testid="lbl-option-bug"]')
      ?.getAttribute("aria-pressed"),
  ).toBe("false");
});

test("option クリックで onToggle がその名前で呼ばれ popover は開いたまま（多選択）", () => {
  const onToggle = vi.fn();
  render(baseProps({ onToggle }));
  openPopover();
  act(() => {
    (
      document.querySelector(
        '[data-testid="lbl-option-bug"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledWith("bug");
  expect(document.querySelector('[data-testid="lbl-popover"]')).toBeTruthy();
});

test("検索でラベル名を部分一致フィルタする", () => {
  render(baseProps());
  openPopover();
  typeSearch("fea");
  const options = Array.from(
    document.querySelectorAll('[data-testid^="lbl-option-"]'),
  );
  expect(options.map((o) => o.textContent)).toEqual(["feature"]);
});

test("既存に無い検索語では作成候補が出て、選ぶと onToggle が呼ばれる", () => {
  const onToggle = vi.fn();
  render(baseProps({ onToggle }));
  openPopover();
  typeSearch("brand-new");
  const create = document.querySelector(
    '[data-testid="lbl-create"]',
  ) as HTMLButtonElement;
  expect(create.textContent).toContain("brand-new");
  act(() => {
    create.click();
  });
  expect(onToggle).toHaveBeenCalledWith("brand-new");
});

test("既存ラベルと完全一致する検索語では作成候補を出さない", () => {
  render(baseProps());
  openPopover();
  typeSearch("bug");
  expect(document.querySelector('[data-testid="lbl-create"]')).toBeNull();
});

test("検索で Enter すると作成候補があれば作成する", () => {
  const onToggle = vi.fn();
  render(baseProps({ onToggle }));
  openPopover();
  typeSearch("urgent");
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  act(() => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onToggle).toHaveBeenCalledWith("urgent");
});

test("open 中の Esc は popover のみ閉じ、親の Esc ハンドラへ伝播しない", () => {
  const parentEsc = vi.fn();
  document.addEventListener("keydown", parentEsc);
  render(baseProps());
  openPopover();
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  act(() => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(document.querySelector('[data-testid="lbl-popover"]')).toBeNull();
  expect(parentEsc).not.toHaveBeenCalled();
  document.removeEventListener("keydown", parentEsc);
});

test("disabled では trigger が無効化され popover が開かない", () => {
  render(baseProps({ disabled: true }));
  expect(trigger().disabled).toBe(true);
  openPopover();
  expect(document.querySelector('[data-testid="lbl-popover"]')).toBeNull();
});
