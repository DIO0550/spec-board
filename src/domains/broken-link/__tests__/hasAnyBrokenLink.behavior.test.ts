import { expect, test } from "vitest";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { buildTasksByNormalizedPath, hasAnyBrokenLink } from "..";

const map = () => {
  const a = makeTask({ id: "a", filePath: "tasks/a.md" });
  return buildTasksByNormalizedPath([a]);
};

test.each([
  {
    label: "parent broken のみで true",
    task: makeTask({ id: "x", parent: "tasks/missing.md" }),
    expected: true,
  },
  {
    label: "links broken のみで true",
    task: makeTask({ id: "x", links: ["tasks/missing.md"] }),
    expected: true,
  },
  {
    label: "children broken のみで true",
    task: makeTask({ id: "x", children: ["tasks/missing.md"] }),
    expected: true,
  },
  {
    label: "reverseLinks broken のみで true",
    task: makeTask({ id: "x", reverseLinks: ["tasks/missing.md"] }),
    expected: true,
  },
  {
    label: "何も broken なしで false",
    task: makeTask({
      id: "x",
      parent: "tasks/a.md",
      links: ["tasks/a.md"],
      children: ["tasks/a.md"],
      reverseLinks: ["tasks/a.md"],
    }),
    expected: false,
  },
  {
    label: "ref 一切なしで false",
    task: makeTask({ id: "x" }),
    expected: false,
  },
])("$label", ({ task, expected }) => {
  expect(hasAnyBrokenLink(task, map())).toBe(expected);
});
