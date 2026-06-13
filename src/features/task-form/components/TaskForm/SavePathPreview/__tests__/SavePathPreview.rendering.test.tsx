import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { fileNameErrorMessage } from "../../TaskFormFileName/fileNameErrorMessage";
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

const render = (props: Parameters<typeof SavePathPreview>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(SavePathPreview, props));
  });
};

const pathPreview = () =>
  document.querySelector('[data-testid="task-form-path-preview"]');
const pathWarning = () =>
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

test("invalid 状態では fileNameErrorMessage と同文の警告が表示され、パスは表示されない", () => {
  const error = { code: "FORBIDDEN_CHAR" as const, chars: ["/", "?"] };
  render({ preview: { kind: "invalid", error } });
  expect(pathWarning()?.textContent).toBe(fileNameErrorMessage(error));
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

test("suppressWarning=true の invalid では警告もパスも表示しない（fileName 欄エラーとの二重表示防止）", () => {
  render({
    preview: {
      kind: "invalid",
      error: { code: "FORBIDDEN_CHAR", chars: ["/"] },
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
