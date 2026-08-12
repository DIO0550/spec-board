import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Button } from "..";

test("標準ボタンは30px高と3pxのfocus ringを持つ", () => {
  const html = renderToStaticMarkup(
    createElement(Button, { variant: "primary" }, "保存"),
  );
  expect(html).toContain("h-[30px]");
  expect(html).toContain("focus-visible:ring-[3px]");
});
