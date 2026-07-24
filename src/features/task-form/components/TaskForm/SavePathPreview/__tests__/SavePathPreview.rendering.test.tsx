import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { SavePathPreview } from "..";

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

const render = (props: Parameters<typeof SavePathPreview>[0]): void => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SavePathPreview, props));
  });
};

const pathPreview = (): Element | null =>
  document.querySelector('[data-testid="task-form-path-preview"]');
const pathWarning = (): Element | null =>
  document.querySelector('[data-testid="task-form-path-warning"]');

test("path 状態ではフルパスが表示され、警告は表示されない", () => {
  render({
    preview: {
      kind: "path",
      fileName: "my-task.md",
      relPath: "tasks/my-task.md",
      fullPath: "/tmp/p/tasks/my-task.md",
    },
  });
  expect(pathPreview()?.textContent).toBe("/tmp/p/tasks/my-task.md");
  expect(pathWarning()).toBeNull();
});

test("invalid 状態では BE のエラー文言が警告表示され、パスは表示されない", () => {
  render({
    preview: {
      kind: "invalid",
      error: "タイトルからファイル名を生成できません",
    },
  });
  expect(pathWarning()?.textContent).toBe(
    "タイトルからファイル名を生成できません",
  );
  expect(pathPreview()).toBeNull();
});

test("pending 状態では案内文が表示され、警告・パスは表示されない", () => {
  render({ preview: { kind: "pending" } });
  expect(pathPreview()).toBeNull();
  expect(pathWarning()).toBeNull();
  expect(container?.textContent).toContain(
    "タイトルまたはファイル名を入力すると保存先パスを表示します",
  );
});

test("suppressWarning=true の invalid では警告もパスも表示しない", () => {
  render({
    preview: {
      kind: "invalid",
      error: "タイトルからファイル名を生成できません",
    },
    suppressWarning: true,
  });
  expect(pathWarning()).toBeNull();
  expect(pathPreview()).toBeNull();
});

test("コンテナに aria-live=polite が付与される", () => {
  render({ preview: { kind: "pending" } });
  expect(container?.querySelector('[aria-live="polite"]')).toBeTruthy();
});
