import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LabelDefinition } from "@/domains/label-definition";
import type { LabelsResource } from "@/hooks/useLabels";
import {
  createLabel,
  deleteLabel,
  exportLabels,
  saveFileDialog,
  TauriError,
  updateLabel,
} from "@/lib/tauri";
import { Result } from "@/utils/result";
import { LabelSettingsTab } from "..";

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

const createMock = vi.mocked(createLabel);
const updateMock = vi.mocked(updateLabel);
const deleteMock = vi.mocked(deleteLabel);
const exportMock = vi.mocked(exportLabels);
const saveMock = vi.mocked(saveFileDialog);

const reactActEnvironmentGlobal = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactActEnvironmentGlobal.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  createMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  exportMock.mockReset();
  saveMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

const noopReload = vi.fn(async () => {});

const baseResource = (
  override: Partial<LabelsResource> = {},
): LabelsResource => {
  const labels =
    override.labels ??
    LabelDefinition.listFromWire([{ name: "bug", group: "type" }]);
  return {
    labels,
    usageCounts: override.usageCounts ?? {},
    byName: LabelDefinition.byName(labels),
    status: override.status ?? "loaded",
    reload: override.reload ?? noopReload,
  };
};

const render = (
  resource: LabelsResource,
  onLabelUsageClick: (name: string) => void = () => {},
): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(LabelSettingsTab, { resource, onLabelUsageClick }),
    );
  });
};

const click = (el: Element): void => {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

// React 19 の controlled input は value tracker を使うため、`el.value = v` だけだと
// React に変更が伝わらない。HTMLInputElement.prototype の value setter 経由で
// trigger することで onChange を発火させる（MilestoneSettingsTab テストと同手法）。
const valueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value",
)?.set;

const typeInto = (el: HTMLInputElement, value: string): void => {
  act(() => {
    valueSetter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const submitForm = (form: HTMLFormElement): void => {
  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
};

test("作成成功時に reload が呼ばれフォームが reset される", async () => {
  noopReload.mockClear();
  createMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource({ labels: [] }));

  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "new-label");

  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(createMock).toHaveBeenCalledWith({
    name: "new-label",
    description: undefined,
    group: undefined,
    color: undefined,
  });
  expect(noopReload).toHaveBeenCalledTimes(1);
  // フォームがリセット（name 入力がクリア）
  const nameAfter = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  expect(nameAfter.value).toBe("");
});

test("作成失敗時はフォームが保持され reload は呼ばれない", async () => {
  noopReload.mockClear();
  createMock.mockResolvedValue(Result.err(TauriError.from("重複")));
  render(baseResource({ labels: [] }));

  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "dup");
  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(noopReload).not.toHaveBeenCalled();
  expect(nameInput.value).toBe("dup");
});

test("使用数リンクをクリックすると onLabelUsageClick が呼ばれる", () => {
  const onUsage = vi.fn();
  render(
    baseResource({
      labels: LabelDefinition.listFromWire([{ name: "bug" }]),
      usageCounts: { bug: 3 },
    }),
    onUsage,
  );
  const link = container?.querySelector(
    '[data-testid="label-usage-link"]',
  ) as HTMLButtonElement;
  click(link);
  expect(onUsage).toHaveBeenCalledWith("bug");
});

test("編集ボタン → name 固定でフォーム編集モードになり update で送信される", async () => {
  noopReload.mockClear();
  updateMock.mockResolvedValue(Result.ok(undefined));
  render(
    baseResource({
      labels: LabelDefinition.listFromWire([
        { name: "bug", description: "old", group: "type", color: "#aaaaaa" },
      ]),
    }),
  );
  const editBtn = container?.querySelector(
    '[aria-label="bug を編集"]',
  ) as HTMLButtonElement;
  click(editBtn);
  // name が disable される（編集モード）
  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  expect(nameInput.disabled).toBe(true);
  expect(nameInput.value).toBe("bug");
  // description を変更
  const descInput = container?.querySelector(
    'input[placeholder="デザイン待ちのタスク"]',
  ) as HTMLInputElement;
  typeInto(descInput, "new desc");

  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(updateMock).toHaveBeenCalledWith({
    name: "bug",
    description: "new desc",
    group: "type",
    color: "#aaaaaa",
  });
});

test("削除確認: usageCount>0 のとき件数を含む確認文言、キャンセルで remove 非実行", () => {
  // happy-dom の global.confirm は未定義のため事前に noop を入れて spyOn を可能にする。
  Object.defineProperty(globalThis, "confirm", {
    configurable: true,
    writable: true,
    value: () => false,
  });
  const confirmSpy = vi
    .spyOn(globalThis, "confirm")
    .mockImplementation(() => false);
  render(
    baseResource({
      labels: LabelDefinition.listFromWire([{ name: "bug" }]),
      usageCounts: { bug: 8 },
    }),
  );
  const delBtn = container?.querySelector(
    '[aria-label="bug を削除"]',
  ) as HTMLButtonElement;
  click(delBtn);
  expect(confirmSpy).toHaveBeenCalledWith(
    expect.stringContaining("8 件のタスクで使用中"),
  );
  expect(deleteMock).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test("削除確認: usageCount=0 のときシンプル文言で OK ならば remove 実行", async () => {
  Object.defineProperty(globalThis, "confirm", {
    configurable: true,
    writable: true,
    value: () => true,
  });
  const confirmSpy = vi
    .spyOn(globalThis, "confirm")
    .mockImplementation(() => true);
  deleteMock.mockResolvedValue(Result.ok({ usageCount: 0 }));
  render(
    baseResource({
      labels: LabelDefinition.listFromWire([{ name: "wontfix" }]),
    }),
  );
  const delBtn = container?.querySelector(
    '[aria-label="wontfix を削除"]',
  ) as HTMLButtonElement;
  await act(async () => {
    click(delBtn);
    await Promise.resolve();
  });
  expect(confirmSpy).toHaveBeenCalledWith(
    expect.stringMatching(/「wontfix」を削除しますか/),
  );
  expect(deleteMock).toHaveBeenCalledWith("wontfix");
  confirmSpy.mockRestore();
});

test("エクスポート: 成功 path → exportLabels 呼び出し", async () => {
  saveMock.mockResolvedValue(Result.ok("/tmp/labels.yml"));
  exportMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource());
  // LabelStatsHeader のエクスポートボタンを取得（テキスト "エクスポート" を含む）
  const allButtons = Array.from(
    container?.querySelectorAll("button[type=button]") ?? [],
  ) as HTMLButtonElement[];
  const target = allButtons.find((b) =>
    b.textContent?.includes("エクスポート"),
  );
  expect(target).toBeDefined();
  await act(async () => {
    click(target as HTMLButtonElement);
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(saveMock).toHaveBeenCalled();
  expect(exportMock).toHaveBeenCalledWith({ path: "/tmp/labels.yml" });
});

test("エクスポート: キャンセル時は exportLabels 非呼び出し", async () => {
  saveMock.mockResolvedValue(Result.ok(null));
  render(baseResource());
  const allButtons = Array.from(
    container?.querySelectorAll("button[type=button]") ?? [],
  ) as HTMLButtonElement[];
  const target = allButtons.find((b) =>
    b.textContent?.includes("エクスポート"),
  );
  await act(async () => {
    click(target as HTMLButtonElement);
    await Promise.resolve();
  });
  expect(saveMock).toHaveBeenCalled();
  expect(exportMock).not.toHaveBeenCalled();
});

test("エクスポート: save() 例外時は exportLabels 非呼び出し", async () => {
  saveMock.mockResolvedValue(Result.err(TauriError.from("plugin failed")));
  render(baseResource());
  const allButtons = Array.from(
    container?.querySelectorAll("button[type=button]") ?? [],
  ) as HTMLButtonElement[];
  const target = allButtons.find((b) =>
    b.textContent?.includes("エクスポート"),
  );
  await act(async () => {
    click(target as HTMLButtonElement);
    await Promise.resolve();
  });
  expect(exportMock).not.toHaveBeenCalled();
});

test("エクスポート: in-flight 中の連打は無視され save / exportLabels は 1 回ずつしか呼ばれない", async () => {
  let resolveSave: ((value: Result<string | null, TauriError>) => void) | null =
    null;
  saveMock.mockReturnValue(
    new Promise<Result<string | null, TauriError>>((resolve) => {
      resolveSave = resolve;
    }),
  );
  exportMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource());
  const allButtons = Array.from(
    container?.querySelectorAll("button[type=button]") ?? [],
  ) as HTMLButtonElement[];
  const target = allButtons.find((b) =>
    b.textContent?.includes("エクスポート"),
  ) as HTMLButtonElement;
  // 1 回目クリック → save は pending のまま
  await act(async () => {
    click(target);
    await Promise.resolve();
  });
  // 2 回目クリック（連打）→ ref ガードで即時に弾かれる
  await act(async () => {
    click(target);
    await Promise.resolve();
  });
  expect(saveMock).toHaveBeenCalledTimes(1);
  // 1 回目の save を解決させて invoke まで進める
  await act(async () => {
    resolveSave?.(Result.ok("/tmp/labels.yml"));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(exportMock).toHaveBeenCalledTimes(1);
});

test("プリセット選択で color 入力欄が更新される", () => {
  render(baseResource({ labels: [] }));
  const presetBtn = container?.querySelector(
    '[aria-label="プリセット red"]',
  ) as HTMLButtonElement;
  click(presetBtn);
  const hexInput = container?.querySelector(
    'input[placeholder="7860b5"]',
  ) as HTMLInputElement;
  expect(hexInput.value).toBe("d55753");
});

test("FE は HEX 形式バリデーションを行わず、入力文字列をそのまま createLabel に渡す（BE が lenient に既定色化する契約）", async () => {
  noopReload.mockClear();
  createMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource({ labels: [] }));
  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "bad");
  const hexInput = container?.querySelector(
    'input[placeholder="7860b5"]',
  ) as HTMLInputElement;
  typeInto(hexInput, "not-a-hex");
  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(createMock).toHaveBeenCalledWith({
    name: "bad",
    description: undefined,
    group: undefined,
    color: "#not-a-hex",
  });
});

test("HEX 入力を全削除すると color は undefined として createLabel に渡る（PUT クリア相当）", async () => {
  noopReload.mockClear();
  createMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource({ labels: [] }));
  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "blank");
  const hexInput = container?.querySelector(
    'input[placeholder="7860b5"]',
  ) as HTMLInputElement;
  typeInto(hexInput, "abc123");
  typeInto(hexInput, "");
  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(createMock).toHaveBeenCalledWith({
    name: "blank",
    description: undefined,
    group: undefined,
    color: undefined,
  });
});

test("group / color / description の空白のみ入力は undefined に正規化されて createLabel に渡る", async () => {
  noopReload.mockClear();
  createMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource({ labels: [] }));
  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "blanky");
  const descInput = container?.querySelector(
    'input[placeholder="デザイン待ちのタスク"]',
  ) as HTMLInputElement;
  typeInto(descInput, "   ");
  const groupInput = container?.querySelector(
    'input[placeholder="status"]',
  ) as HTMLInputElement;
  typeInto(groupInput, "   ");
  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(createMock).toHaveBeenCalledWith({
    name: "blanky",
    description: undefined,
    group: undefined,
    color: undefined,
  });
});

test("HEX 入力欄に # 付き 7 文字をペーストしても末尾欠落なく 6 桁全てが取り込まれる", async () => {
  noopReload.mockClear();
  createMock.mockResolvedValue(Result.ok(undefined));
  render(baseResource({ labels: [] }));
  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "with-color");
  const hexInput = container?.querySelector(
    'input[placeholder="7860b5"]',
  ) as HTMLInputElement;
  // ブラウザの maxLength 切り詰めを通過した最終文字列を typeInto で再現する。
  // maxLength=7 なら "#7860b5"（7 文字）全てが onChange に届く前提。
  typeInto(hexInput, "#7860b5");
  const form = container?.querySelector("form") as HTMLFormElement;
  await act(async () => {
    submitForm(form);
    await Promise.resolve();
  });
  expect(createMock).toHaveBeenCalledWith({
    name: "with-color",
    description: undefined,
    group: undefined,
    color: "#7860b5",
  });
});

test("名前が空白のみのときは送信ボタンが disabled になる（trim ベース判定）", () => {
  render(baseResource({ labels: [] }));
  const nameInput = container?.querySelector(
    'input[placeholder="needs-design"]',
  ) as HTMLInputElement;
  typeInto(nameInput, "   ");
  const submit = Array.from(
    container?.querySelectorAll('button[type="submit"]') ?? [],
  )[0] as HTMLButtonElement | undefined;
  expect(submit?.disabled).toBe(true);
});
