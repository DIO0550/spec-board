import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { LabelDefinition } from "@/lib/tauri";
import { LabelsField } from "..";

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
  { name: "Bug", color: "#e11d48" },
  { name: "Feature", color: "#16a34a" },
];

const baseProps = (
  overrides: Partial<Parameters<typeof LabelsField>[0]> = {},
): Parameters<typeof LabelsField>[0] => ({
  label: "ラベル",
  value: [],
  suggestions: SUGGESTIONS,
  onChange: vi.fn(),
  "data-testid": "lbl",
  ...overrides,
});

const render = (props: Parameters<typeof LabelsField>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(LabelsField, props));
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

test("選択済み value は trigger にバッジ表示し placeholder を出さない", () => {
  render(baseProps({ value: ["Bug"] }));
  expect(trigger().textContent).toContain("Bug");
  expect(trigger().textContent).not.toContain("ラベルを選択…");
});

test("空 value では placeholder を表示する", () => {
  render(baseProps({ value: [] }));
  expect(trigger().textContent).toContain("ラベルを選択…");
});

test("trigger クリックで popover が開閉する", () => {
  render(baseProps());
  openPopover();
  expect(document.querySelector('[data-testid="lbl-popover"]')).toBeTruthy();
  openPopover();
  expect(document.querySelector('[data-testid="lbl-popover"]')).toBeNull();
});

test("検索語で候補を部分一致フィルタする", () => {
  render(baseProps());
  openPopover();
  typeSearch("ug");
  const options = Array.from(
    document.querySelectorAll('[data-testid^="lbl-option-"]'),
  );
  expect(options.map((o) => o.textContent)).toEqual(["Bug"]);
});

test("未選択 option のトグルで onChange が選択追加後の配列で呼ばれる", () => {
  const onChange = vi.fn();
  render(baseProps({ value: [], onChange }));
  openPopover();
  act(() => {
    (
      document.querySelector(
        '[data-testid="lbl-option-Bug"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onChange).toHaveBeenCalledWith(["Bug"]);
});

test("選択済み option のトグルで onChange が除外後の配列で呼ばれる", () => {
  const onChange = vi.fn();
  render(baseProps({ value: ["Bug"], onChange }));
  openPopover();
  act(() => {
    (
      document.querySelector(
        '[data-testid="lbl-option-Bug"]',
      ) as HTMLButtonElement
    ).click();
  });
  expect(onChange).toHaveBeenCalledWith([]);
});

test("候補に無い検索語で作成ボタンを押すと onChange に追加され検索がクリアされる", () => {
  const onChange = vi.fn();
  render(baseProps({ value: [], suggestions: [], onChange }));
  openPopover();
  typeSearch("New");
  const create = document.querySelector(
    '[data-testid="lbl-create"]',
  ) as HTMLButtonElement;
  act(() => {
    create.click();
  });
  expect(onChange).toHaveBeenCalledWith(["New"]);
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  expect(search.value).toBe("");
});

test("作成可能な検索語で Enter すると作成する", () => {
  const onChange = vi.fn();
  render(baseProps({ value: [], suggestions: [], onChange }));
  openPopover();
  typeSearch("Urgent");
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  act(() => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onChange).toHaveBeenCalledWith(["Urgent"]);
});

test("作成不可（候補一致）で Enter すると先頭候補をトグルする", () => {
  const onChange = vi.fn();
  render(baseProps({ value: [], onChange }));
  openPopover();
  typeSearch("bug");
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  act(() => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onChange).toHaveBeenCalledWith(["Bug"]);
});

test("大文字小文字違いは作成不可（作成ボタンを出さない）", () => {
  const onChange = vi.fn();
  render(baseProps({ value: [], onChange }));
  openPopover();
  typeSearch("bug");
  expect(document.querySelector('[data-testid="lbl-create"]')).toBeNull();
});

test("候補未取得（suggestions=[]）でも新規作成できる", () => {
  render(baseProps({ suggestions: [] }));
  openPopover();
  typeSearch("X");
  expect(
    Array.from(document.querySelectorAll('[data-testid^="lbl-option-"]')),
  ).toEqual([]);
  expect(document.querySelector('[data-testid="lbl-create"]')).toBeTruthy();
});

test("master と task の case 食い違いでも ✓ 表示しトグルで case 重複を作らない", () => {
  const onChange = vi.fn();
  render(baseProps({ value: ["bug"], onChange }));
  openPopover();
  const option = document.querySelector(
    '[data-testid="lbl-option-Bug"]',
  ) as HTMLButtonElement;
  expect(option.getAttribute("aria-pressed")).toBe("true");
  act(() => {
    option.click();
  });
  expect(onChange).toHaveBeenCalledWith([]);
});

test("IME 変換中の Enter では作成・トグルしない", () => {
  const onChange = vi.fn();
  render(baseProps({ value: [], suggestions: [], onChange }));
  openPopover();
  typeSearch("日本語");
  const search = document.querySelector(
    '[data-testid="lbl-search"]',
  ) as HTMLInputElement;
  act(() => {
    search.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        isComposing: true,
      }),
    );
  });
  expect(onChange).not.toHaveBeenCalled();
});

test("open 中の Esc は popover のみ閉じ親へ伝播しない", () => {
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
