import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ColumnHeader } from "..";

test("カラムヘッダーは左アクセント、下罫線、固定高の操作ボタンを持つ", () => {
  const html = renderToStaticMarkup(
    createElement(ColumnHeader, {
      name: "Todo",
      taskCount: 3,
      color: "#1a2b3c",
      order: 0,
      onAddClick: vi.fn(),
      onContextMenu: vi.fn(),
    }),
  );

  expect(html).toContain('data-testid="column-accent"');
  expect(html).toContain("border-b");
  expect(html).toContain("h-[22px]");
  expect(html).toContain("font-mono");
});
