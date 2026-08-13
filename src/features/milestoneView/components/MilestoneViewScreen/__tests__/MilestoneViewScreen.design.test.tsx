import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import type { MilestonesResource } from "@/hooks/useMilestones";
import { MilestoneViewScreen } from "..";

const resource: MilestonesResource = {
  status: "loaded",
  milestones: [{ name: "v1", title: "Release", state: "open" }],
  byName: new Map(),
  usageCounts: {},
  reload: async () => {},
};

test("max1280の画面内でmainと360px detailを表示しexport導線を持つ", () => {
  const html = renderToStaticMarkup(
    createElement(MilestoneViewScreen, {
      resource,
      tasks: [],
      doneColumn: "Done",
      milestoneProjections: new Map(),
      taskProjections: TaskProjection.emptyMap,
    }),
  );

  expect(html).toContain("max-w-[1280px]");
  expect(html).toContain("h-[calc(100vh-92px)]");
  expect(html).toContain("min-[900px]:grid-cols-[minmax(0,1fr)_360px]");
  expect(html).toContain("エクスポート");
});
