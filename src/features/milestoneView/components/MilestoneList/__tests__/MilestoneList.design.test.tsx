import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { MilestoneDefinition } from "@/domains/milestone";
import { MilestoneList } from "..";

const milestones: MilestoneDefinition[] = [
  { name: "v2", title: "次のリリース", state: "open" },
  { name: "v1", title: "完了済み", state: "closed" },
];

test("OpenとClosedを件数付きグループに分けて12px間隔で表示する", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneList, {
      milestones,
      statusOf: (definition) =>
        definition.state === "closed" ? "closed" : "open",
      projectionOf: () => ({ done: 1, total: 2, taskFilePaths: [] }),
      showRatio: true,
      selectedName: undefined,
      onSelect: vi.fn(),
      now: new Date("2026-08-11T12:00:00Z"),
    }),
  );

  expect(html).toContain('data-testid="milestone-group-open"');
  expect(html).toContain('data-testid="milestone-group-closed"');
  expect(html).toContain("gap-3");
});
