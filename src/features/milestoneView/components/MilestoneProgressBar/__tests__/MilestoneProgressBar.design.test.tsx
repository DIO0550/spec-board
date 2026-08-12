import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { MilestoneProgressBar } from "..";

test("進捗を4状態のsegmented barと割合・件数で表示する", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneProgressBar, { done: 3, total: 5, ratio: 0.6 }),
  );

  expect(html).toContain('data-testid="milestone-progress-segments"');
  expect(html).toContain('data-segment="done"');
  expect(html).toContain('data-segment="review"');
  expect(html).toContain('data-segment="in-progress"');
  expect(html).toContain('data-segment="todo"');
  expect(html).toContain("60%");
  expect(html).toContain("3 / 5 完了");
});
