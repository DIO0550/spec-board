import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { Toast } from "..";

test("toastは320px幅のrich layoutと閉じる操作を持つ", () => {
  const html = renderToStaticMarkup(
    createElement(Toast, {
      toast: { id: "saved", type: "success", message: "保存しました" },
      onDismiss: vi.fn(),
    }),
  );
  expect(html).toContain("w-[320px]");
  expect(html).toContain('aria-label="閉じる"');
  expect(html).toContain("保存しました");
});
