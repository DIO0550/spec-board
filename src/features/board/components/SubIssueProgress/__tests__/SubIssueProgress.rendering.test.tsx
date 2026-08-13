import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { SubIssueProgress, type SubIssueRow } from "..";

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

const row = (key: string, label: string, isDone: boolean): SubIssueRow => ({
  key,
  label,
  isDone,
});

function render(props: Parameters<typeof SubIssueProgress>[0]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SubIssueProgress, props));
  });
}

test("total が 1 以上で進捗バーが表示される", () => {
  render({
    childRows: [row("c1", "子タスク", false)],
    counts: { done: 0, total: 1 },
  });
  const progressBar = container?.querySelector("[role='progressbar']");
  expect(progressBar).toBeTruthy();
});

test("視覚テキストには X/Y 数値を表示しない（フッターへ集約）", () => {
  render({
    childRows: [row("c1", "子タスク", true)],
    counts: { done: 2, total: 5 },
  });
  expect(container?.textContent).not.toContain("2/5");
});

test("progressbar に進捗が aria 属性として残る（done=2/total=5 → aria-label と aria-valuenow=40）", () => {
  render({
    childRows: [row("c1", "子1", true), row("c2", "子2", false)],
    counts: { done: 2, total: 5 },
  });
  const bar = container?.querySelector("[role='progressbar']") as HTMLElement;
  expect(bar.getAttribute("aria-valuenow")).toBe("40");
  expect(bar.getAttribute("aria-label")).toBe("進捗 2/5");
});

test("▶ クリックで子タスクリストが展開される", () => {
  render({
    childRows: [row("c1", "タスクA", false), row("c2", "タスクB", true)],
    counts: { done: 1, total: 2 },
  });
  const details = container?.querySelector("details") as HTMLDetailsElement;
  expect(details.open).toBe(false);

  const summary = details.querySelector("summary") as HTMLElement;
  act(() => {
    summary.click();
  });

  expect(details.open).toBe(true);
  expect(container?.textContent).toContain("タスクA");
  expect(container?.textContent).toContain("タスクB");
});

test("印刷時に子リストを強制展開するための識別子を持つ", () => {
  render({
    childRows: [row("c1", "タスクA", false)],
    counts: { done: 0, total: 1 },
  });

  expect(
    container?.querySelector("details")?.hasAttribute("data-sub-issue"),
  ).toBe(true);
});

test("total が 0 で非表示", () => {
  render({ childRows: [], counts: { done: 0, total: 0 } });
  expect(container?.innerHTML).toBe("");
});

test("全子孫タスクが完了の場合、バーが 100% になる", () => {
  render({
    childRows: [row("c1", "子1", true)],
    counts: { done: 3, total: 3 },
  });
  const progressBar = container?.querySelector(
    "[role='progressbar']",
  ) as HTMLElement;
  expect(progressBar.getAttribute("aria-valuenow")).toBe("100");
});

test("<details> 内 <ul> の <li> 数は childRows.length と一致する（counts ではない）", () => {
  render({
    childRows: [row("c1", "child1", false), row("c2", "child2", false)],
    counts: { done: 0, total: 4 },
  });
  const lis = container?.querySelectorAll("details ul li");
  expect(lis?.length).toBe(2);
});

test("childRows が空でも counts.total が 1 以上なら進捗バーを描画する（孫のみ持つ親）", () => {
  render({ childRows: [], counts: { done: 1, total: 3 } });

  const bar = container?.querySelector("[role='progressbar']") as HTMLElement;
  expect(bar.getAttribute("aria-valuenow")).toBe("33");
  expect(container?.querySelectorAll("details ul li").length).toBe(0);
});

test("childRows の isDone で完了アイコンを出し分ける", () => {
  render({
    childRows: [row("c1", "完了子", true), row("c2", "未完了子", false)],
    counts: { done: 1, total: 2 },
  });

  const icons = Array.from(
    container?.querySelectorAll("details ul li [role='img']") ?? [],
  ).map((node) => node.getAttribute("aria-label"));
  expect(icons).toEqual(["完了", "未完了"]);
});

test("childRows の label をそのまま表示する", () => {
  render({
    childRows: [row("c1", "tasks/fallback.md", false)],
    counts: { done: 0, total: 1 },
  });

  expect(container?.textContent).toContain("tasks/fallback.md");
});
