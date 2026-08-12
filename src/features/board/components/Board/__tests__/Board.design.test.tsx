import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Board } from "..";

test("ボード面は16px余白・12px間隔でカラムを横スクロール表示する", () => {
  const html = renderToStaticMarkup(createElement(Board));

  expect(html).toContain("gap-3");
  expect(html).toContain("p-4");
  expect(html).toContain("overflow-x-auto");
  expect(html).toContain("print:overflow-visible");
  expect(html).toContain("bg-bg");
  expect(html).toContain("items-start");
});
