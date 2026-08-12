import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { MilestoneCreateModal } from "..";

test("labelsとassignee入力およびname追従slug領域を表示する", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneCreateModal, {
      onCreate: vi.fn(),
      onClose: vi.fn(),
      isPending: false,
      labelOptions: ["release"],
      assigneeOptions: ["mika"],
    }),
  );
  expect(html).toContain('data-testid="milestone-create-labels"');
  expect(html).toContain('data-testid="milestone-create-assignee"');
  expect(html).toContain('data-testid="milestone-create-slug"');
});
