import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { ParentLink } from "..";

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
 * テスト用の Task を生成するファクトリ。
 * @param overrides - 上書きフィールド
 * @returns Task
 */
const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: "p1",
    title: "親タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/parent.md",
    ...overrides,
  });

/**
 * ParentLink をレンダリングするヘルパー。
 * @param props - ParentLink に渡す props
 */
const render = (props: Parameters<typeof ParentLink>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(ParentLink, props));
  });
};

const noop = () => {};

test("button の表示テキストが '親: <parentTask.title>' 形式である", () => {
  const parent = makeTask({ title: "親タスクABC" });
  render({ parentTask: parent, onSelect: noop });
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  expect(button?.textContent).toBe("親: 親タスクABC");
});

test("button の aria-label が '親タスクに遷移: <parentTask.title>' 形式である", () => {
  const parent = makeTask({ title: "親タスクABC" });
  render({ parentTask: parent, onSelect: noop });
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  expect(button?.getAttribute("aria-label")).toBe(
    "親タスクに遷移: 親タスクABC",
  );
});

test("button は type='button' で data-testid='detail-parent-link' を持つ", () => {
  const parent = makeTask({ title: "親タスクABC" });
  render({ parentTask: parent, onSelect: noop });
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  expect(button).not.toBeNull();
  expect(button?.getAttribute("type")).toBe("button");
});

test("parentTask.title が空文字のとき、表示テキスト・aria-label が filePath にフォールバックする", () => {
  const parent = makeTask({ title: "", filePath: "tasks/parent.md" });
  render({ parentTask: parent, onSelect: noop });
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-testid="detail-parent-link"]',
  );
  expect(button?.textContent).toBe("親: tasks/parent.md");
  expect(button?.getAttribute("aria-label")).toBe(
    "親タスクに遷移: tasks/parent.md",
  );
});
