import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { PriorityBadge } from "..";

test("優先度は色付きドットで表し、文字列は支援技術向けに残す", () => {
  const html = renderToStaticMarkup(
    createElement(PriorityBadge, { priority: "High" }),
  );

  expect(html).toContain("size-2");
  expect(html).toContain("rounded-full");
  expect(html).toContain("sr-only");
  expect(html).toContain('aria-label="優先度: High"');
});
