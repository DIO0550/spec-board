import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task } from "@/types/task";
import { CommandPalette } from "..";

const task = Task.fromPayload({
  id: "SB-42",
  title: "Keyboard shortcuts",
  status: "Todo",
  labels: ["a11y"],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/keyboard.md",
});
let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const renderPalette = (
  props: Partial<Parameters<typeof CommandPalette>[0]> = {},
) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onOpenChange = vi.fn();
  const onTaskSelect = vi.fn();
  act(() => {
    root?.render(
      createElement(CommandPalette, {
        tasks: [task],
        isOpen: true,
        onOpenChange,
        onTaskSelect,
        onNewTask: vi.fn(),
        onSettings: vi.fn(),
        onMilestones: vi.fn(),
        onGuide: vi.fn(),
        ...props,
      }),
    );
  });
  return { onOpenChange, onTaskSelect };
};

test("検索してEnterで選択taskを通知し閉じる", () => {
  const callbacks = renderPalette();
  const input = container?.querySelector<HTMLInputElement>('[role="combobox"]');
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "key");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() =>
    input?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(callbacks.onTaskSelect).toHaveBeenCalledWith("SB-42");
  expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
});

test("Escapeで閉じCtrl+Kで開く", () => {
  const callbacks = renderPalette();
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
  act(() =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
    ),
  );
  expect(callbacks.onOpenChange).toHaveBeenCalledWith(true);
});

test("大量taskでも表示を50件に制限し総件数と絞込案内を表示する", () => {
  const tasks = Array.from({ length: 1_000 }, (_, index) =>
    Task.fromPayload({
      id: `SB-${index}`,
      title: `Task ${index}`,
      status: "Todo",
      labels: ["bulk"],
      links: [],
      children: [],
      reverseLinks: [],
      body: "",
      filePath: `tasks/${index}.md`,
    }),
  );

  renderPalette({ tasks });

  expect(container?.querySelectorAll('[role="option"]')).toHaveLength(50);
  expect(container?.textContent).toContain("1,004件中50件を表示");
  expect(container?.textContent).toContain(
    "検索語を追加して絞り込んでください",
  );
});

test("絞り込みで結果数が減ったとき選択位置を表示範囲へ戻す", () => {
  const tasks = Array.from({ length: 60 }, (_, index) =>
    Task.fromPayload({
      id: `SB-${index}`,
      title: index === 0 ? "Only matching task" : `Task ${index}`,
      status: "Todo",
      labels: [],
      links: [],
      children: [],
      reverseLinks: [],
      body: "",
      filePath: `tasks/${index}.md`,
    }),
  );
  const callbacks = renderPalette({ tasks });
  const input = container?.querySelector<HTMLInputElement>('[role="combobox"]');
  act(() => {
    for (let index = 0; index < 49; index += 1) {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    }
  });
  act(() => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, "Only matching");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() =>
    input?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );

  expect(callbacks.onTaskSelect).toHaveBeenCalledWith("SB-0");
});
