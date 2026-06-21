import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { TaskCard } from "..";
import { wrapWithCardProvider } from "./_testHelpers";

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

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テスト",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

/**
 * BoardCardProvider 配下に TaskCard を mount する。
 * @param props TaskCard props
 */
const render = (props: Parameters<typeof TaskCard>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      wrapWithCardProvider(<TaskCard {...props} />, { task: props.task }),
    );
  });
};

const queryParseErrorIcon = (): Element | null =>
  document.querySelector('[data-testid="parse-error-icon"]');
const queryWarningIcon = (): Element | null =>
  document.querySelector('[data-testid="warning-icon"]');

test("hasParseError=true / hasBrokenLink=false で赤アイコンのみ表示される", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasParseError: true,
    hasBrokenLink: false,
  });
  expect(queryParseErrorIcon()).not.toBeNull();
  expect(queryWarningIcon()).toBeNull();
});

test("hasBrokenLink=true / hasParseError=true で黄・赤アイコンが両方表示される", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasBrokenLink: true,
    hasParseError: true,
  });
  expect(queryWarningIcon()).not.toBeNull();
  expect(queryParseErrorIcon()).not.toBeNull();
});

test("両フラグ未指定でアイコンが 1 つも描画されない", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
  });
  expect(queryWarningIcon()).toBeNull();
  expect(queryParseErrorIcon()).toBeNull();
});

test("ParseErrorIcon の aria-label は『パースエラーあり』である", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasParseError: true,
  });
  expect(queryParseErrorIcon()?.getAttribute("aria-label")).toBe(
    "パースエラーあり",
  );
});

test("onClick あり（役割=button）でも hasParseError=true で赤アイコンが描画される", () => {
  render({
    task: makeTask(),
    fromColumn: "Todo",
    hasParseError: true,
    onClick: vi.fn(),
  });
  expect(queryParseErrorIcon()).not.toBeNull();
});
