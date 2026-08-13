import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { ConfirmDialog } from "..";

test("確認とキャンセルはcommon 30px button contractを使う", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmDialog, {
      title: "削除",
      message: "確認",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    }),
  );
  expect(html.match(/h-\[30px\]/g)).toHaveLength(2);
  expect(html.match(/focus-visible:ring-\[3px\]/g)).toHaveLength(2);
});
