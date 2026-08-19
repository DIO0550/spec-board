import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  getTaskTemplates,
  previewTaskMarkdown,
  unregisterToastSink,
} from "@/lib/tauri";
import type { TaskTemplatePayload } from "@/lib/tauri/taskCommands/types";
import { ToastProvider } from "@/providers/ToastProvider";
import type { Column } from "@/types/column";
import { Result } from "@/utils/result";
import { TaskCreateScreen } from "..";

vi.mock("@/lib/tauri", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/tauri")>("@/lib/tauri");
  return {
    ...actual,
    previewTaskMarkdown: vi.fn(),
    getTaskTemplates: vi.fn(),
  };
});

const previewMarkdownMock = vi.mocked(previewTaskMarkdown);
const getTaskTemplatesMock = vi.mocked(getTaskTemplates);

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

const BUG_TEMPLATE: TaskTemplatePayload = {
  name: "bug-report",
  title: "バグ報告",
  status: "Done",
  priority: "High",
  labels: ["bug"],
  links: [],
  draft: true,
  body: "## 再現手順",
};

const UNKNOWN_STATUS_TEMPLATE: TaskTemplatePayload = {
  name: "unknown-status",
  title: "未知ステータス",
  status: "Nonexistent",
  labels: [],
  links: [],
  draft: false,
  body: "",
};

beforeEach(() => {
  previewMarkdownMock.mockReset();
  previewMarkdownMock.mockImplementation(async () => Result.ok("preview"));
  getTaskTemplatesMock.mockReset();
  getTaskTemplatesMock.mockResolvedValue(
    Result.ok({ templates: [BUG_TEMPLATE, UNKNOWN_STATUS_TEMPLATE] }),
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  unregisterToastSink();
});

const COLUMNS: Column[] = [
  { name: "Todo", order: 0 },
  { name: "Done", order: 1 },
];

/** TaskCreateScreen を ToastProvider 配下で描画する。 */
async function renderScreen() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      createElement(
        ToastProvider,
        null,
        createElement(TaskCreateScreen, {
          columns: COLUMNS,
          initialStatus: "Todo",
          existingTasks: [],
          watchedFileCount: 0,
          onSubmit: vi.fn(async () =>
            Result.ok({
              parent: { filePath: "tasks/x.md" },
              failedSubIssues: [],
            }),
          ) as never,
          onClose: vi.fn(),
        }),
      ),
    );
  });
}

/** @returns テンプレート select 要素（無ければ null） */
function templateSelect(): HTMLSelectElement | null {
  return (
    container?.querySelector<HTMLSelectElement>(
      "[data-testid='task-template-select']",
    ) ?? null
  );
}

/** @returns タイトル入力要素 */
function titleInput(): HTMLInputElement | null {
  return (
    container?.querySelector<HTMLInputElement>(
      "[data-testid='task-form-title']",
    ) ?? null
  );
}

/** @returns 本文入力要素 */
function bodyTextarea(): HTMLTextAreaElement | null {
  return (
    container?.querySelector<HTMLTextAreaElement>(
      "[data-testid='task-form-body']",
    ) ?? null
  );
}

/**
 * select の値を変更して change イベントを発火する。
 * @param select - 対象 select
 * @param value - 選択する値
 */
async function selectTemplate(select: HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * input / textarea へ React 管理下の値変更イベントを発火する。
 * @param element - 対象要素
 * @param value - 設定する値
 */
async function setFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

test("テンプレートが 1 件以上あると select が表示される", async () => {
  await renderScreen();
  await vi.waitFor(() => {
    expect(templateSelect()).not.toBeNull();
  });
  const options = Array.from(templateSelect()?.options ?? []).map(
    (option) => option.value,
  );
  expect(options).toEqual(["", "bug-report", "unknown-status"]);
});

test("テンプレート取得失敗時は select を表示しない", async () => {
  getTaskTemplatesMock.mockResolvedValue(
    Result.err(new Error("fail") as never),
  );
  await renderScreen();
  expect(templateSelect()).toBeNull();
});

test("テンプレートが 0 件のときは select を表示しない", async () => {
  getTaskTemplatesMock.mockResolvedValue(Result.ok({ templates: [] }));
  await renderScreen();
  expect(templateSelect()).toBeNull();
});

test("未入力状態でテンプレートを選ぶと即座にフォームへ流し込まれる", async () => {
  await renderScreen();
  await vi.waitFor(() => {
    expect(templateSelect()).not.toBeNull();
  });
  await selectTemplate(templateSelect() as HTMLSelectElement, "bug-report");
  await vi.waitFor(() => {
    expect(titleInput()?.value).toBe("バグ報告");
    expect(bodyTextarea()?.value).toBe("## 再現手順");
  });
  // 確認ダイアログは出ない
  expect(container?.textContent).not.toContain("テンプレートを適用しますか？");
});

test("入力済みの状態では確認ダイアログを挟み、適用で上書きされる", async () => {
  await renderScreen();
  await vi.waitFor(() => {
    expect(templateSelect()).not.toBeNull();
  });
  await setFieldValue(titleInput() as HTMLInputElement, "手入力タイトル");
  await selectTemplate(templateSelect() as HTMLSelectElement, "bug-report");
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("テンプレートを適用しますか？");
  });
  // まだ上書きされない
  expect(titleInput()?.value).toBe("手入力タイトル");
  const applyButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>(
      "[data-testid='confirm-confirm-button']",
    ) ?? [],
  ).find((button) => button.textContent === "適用する");
  await act(async () => {
    applyButton?.click();
  });
  await vi.waitFor(() => {
    expect(titleInput()?.value).toBe("バグ報告");
  });
});

test("確認ダイアログをキャンセルすると入力が保持される", async () => {
  await renderScreen();
  await vi.waitFor(() => {
    expect(templateSelect()).not.toBeNull();
  });
  await setFieldValue(titleInput() as HTMLInputElement, "手入力タイトル");
  await selectTemplate(templateSelect() as HTMLSelectElement, "bug-report");
  await vi.waitFor(() => {
    expect(container?.textContent).toContain("テンプレートを適用しますか？");
  });
  // 画面 footer にも「キャンセル」ボタンがあるため、確認ダイアログ内に限定して探す。
  const templateDialog = Array.from(
    container?.querySelectorAll<HTMLElement>(
      "[data-testid='confirm-dialog']",
    ) ?? [],
  ).find((dialog) => dialog.textContent?.includes("テンプレートを適用"));
  const cancelButton = templateDialog?.querySelector<HTMLButtonElement>(
    "[data-testid='confirm-cancel-button']",
  );
  await act(async () => {
    cancelButton?.click();
  });
  await vi.waitFor(() => {
    expect(container?.textContent).not.toContain(
      "テンプレートを適用しますか？",
    );
  });
  expect(titleInput()?.value).toBe("手入力タイトル");
  expect(templateSelect()?.value).toBe("");
});

test("カラムに存在しない status のテンプレートは作成元カラムを維持する", async () => {
  await renderScreen();
  await vi.waitFor(() => {
    expect(templateSelect()).not.toBeNull();
  });
  await selectTemplate(templateSelect() as HTMLSelectElement, "unknown-status");
  await vi.waitFor(() => {
    expect(titleInput()?.value).toBe("未知ステータス");
  });
  // プレビュー要求の status がフォールバック（作成元カラム）のまま
  await vi.waitFor(() => {
    const calls = previewMarkdownMock.mock.calls;
    const lastCall = calls[calls.length - 1];
    expect(lastCall?.[0]?.status).toBe("Todo");
  });
});
