import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import type { ConfigFileDefinition, ConfigFileId } from "../../types";
import { ConfigFileList } from "..";

const files: readonly ConfigFileDefinition[] = [
  {
    id: "config",
    name: "config.json",
    path: ".spec-board/config.json",
    badge: "1 KB",
    language: "JSON",
    content: "{}",
    generated: false,
  },
  {
    id: "guide",
    name: "GUIDE.md",
    path: ".spec-board/GUIDE.md",
    badge: "自動生成",
    language: "Markdown",
    content: "# Guide",
    generated: true,
  },
];

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const Harness = () => {
  const [selectedId, setSelectedId] = useState<ConfigFileId>("config");
  return (
    <ConfigFileList
      files={files}
      selectedId={selectedId}
      onSelect={setSelectedId}
    />
  );
};

test("設定ファイル選択はlistbox/optionの完全なsemanticsを持つ", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(Harness)));
  expect(container.querySelector('[role="listbox"]')).not.toBeNull();
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  expect(container.querySelector('[role="tab"]')).toBeNull();
});

test("ArrowDownで次のoptionを選択してfocusを移す", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(Harness)));
  const options =
    container.querySelectorAll<HTMLButtonElement>('[role="option"]');
  act(() => {
    options[0]?.focus();
    options[0]?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  expect(options[1]?.getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(options[1]);
});
