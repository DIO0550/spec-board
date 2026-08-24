import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import type { MilestoneDefinition } from "@/domains/milestone";
import type { MilestoneProjectionMap } from "@/domains/milestone-projection";
import type { TaskProjectionMap } from "@/domains/task-projection";
import type { SettingsTabId } from "@/features/settings";
import type { MilestonesResource } from "@/hooks/useMilestones";
import { Task } from "@/types/task";
import { MilestoneViewScreen } from "..";

const definitions: MilestoneDefinition[] = [
  { name: "active", title: "Active", state: "open", order: 0 },
  { name: "unused", title: "Unused", state: "open", order: 1 },
  { name: "__proto__", title: "Special", state: "open", order: 2 },
];

const resource: MilestonesResource = {
  status: "loaded",
  milestones: definitions,
  byName: new Map(
    definitions.map((definition) => [definition.name, definition]),
  ),
  usageCounts: { active: 99 },
  reload: vi.fn(async () => undefined),
};

const makeTask = (id: string, milestone: string, status = "Todo"): Task =>
  Task.fromPayload({
    id,
    title: id,
    status,
    milestone,
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: `tasks/${id}.md`,
    extras: {},
    warnings: [],
  });

const tasks = [
  makeTask("a", "active"),
  makeTask("not-in-projection", "active", "Done"),
  makeTask("b", "active"),
  makeTask("special", "__proto__"),
  makeTask("ghost", "ghost"),
];

const milestoneProjections: MilestoneProjectionMap = new Map([
  [
    "active",
    {
      done: 1,
      total: 3,
      taskFilePaths: [
        taskFilePathFixture("tasks/b.md"),
        taskFilePathFixture("tasks/missing.md"),
        taskFilePathFixture("tasks/a.md"),
      ],
    },
  ],
  [
    "__proto__",
    {
      done: 1,
      total: 1,
      taskFilePaths: [taskFilePathFixture("tasks/special.md")],
    },
  ],
  [
    "ghost",
    {
      done: 0,
      total: 2,
      taskFilePaths: [
        taskFilePathFixture("tasks/ghost.md"),
        taskFilePathFixture("tasks/ghost-missing.md"),
      ],
    },
  ],
]);

const taskProjections: TaskProjectionMap = new Map([
  [
    taskFilePathFixture("tasks/a.md"),
    {
      subIssueProgress: { done: 0, total: 0 },
      isDone: false,
      childFilePaths: [],
    },
  ],
  [
    taskFilePathFixture("tasks/b.md"),
    {
      subIssueProgress: { done: 0, total: 0 },
      isDone: true,
      childFilePaths: [],
    },
  ],
]);

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const renderScreen = (doneColumn: string | undefined) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneViewScreen, {
        resource,
        tasks,
        doneColumn,
        milestoneProjections,
        taskProjections,
      }),
    );
  });
  return container;
};

test("resident projection は zero・unknown・特殊名を含む件数と進捗を表示する", () => {
  const view = renderScreen("Done");
  const rows = Array.from(
    view.querySelectorAll<HTMLElement>('[data-testid="milestone-view-row"]'),
  );

  expect(
    view.querySelector('[data-testid="milestone-view-stats"]')?.textContent,
  ).toContain("2/6");
  expect(
    rows.find((row) => row.textContent?.includes("Active"))?.textContent,
  ).toContain("1 / 3 完了");
  expect(
    rows.find((row) => row.textContent?.includes("Unused"))?.textContent,
  ).toContain("0 / 0 完了");
  expect(
    rows.find((row) => row.textContent?.includes("Special"))?.textContent,
  ).toContain("1 / 1 完了");
});

test("初期状態はマイルストーン未選択で詳細プレースホルダを表示する", () => {
  const view = renderScreen("Done");

  expect(view.textContent).toContain(
    "マイルストーンを選択すると詳細を表示します",
  );
});

test("設定サブナビは4種subsetを維持し選択したcanonical IDをcallbackへ渡す", () => {
  const selectedTabs: SettingsTabId[] = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(MilestoneViewScreen, {
        resource,
        tasks,
        doneColumn: "Done",
        milestoneProjections,
        taskProjections,
        projectName: "spec-board",
        onSettingsTab: (tabId) => selectedTabs.push(tabId),
      }),
    );
  });

  const tabs = Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-settings-tab]"),
  );
  expect(tabs.map((tab) => tab.dataset.settingsTab)).toEqual([
    "labels",
    "milestones",
    "statuses",
    "config",
  ]);

  act(() => tabs[0]?.click());
  expect(selectedTabs).toEqual(["labels"]);
});

test("done column 未解決でも projection の done/total は表示し ratio だけ隠す", () => {
  const view = renderScreen(undefined);

  expect(
    view.querySelectorAll('[data-testid="milestone-progress-bar"]'),
  ).toHaveLength(0);
  expect(view.textContent).toContain("1 / 3 完了");
  expect(view.textContent).toContain("1 / 1 完了");
});

test("選択 task は projection path 順に解決し missing pathや再集計fallbackを含めない", () => {
  const view = renderScreen("Done");
  const activeRow = Array.from(
    view.querySelectorAll<HTMLButtonElement>(
      '[data-testid="milestone-view-row"]',
    ),
  ).find((row) => row.textContent?.includes("Active"));

  act(() => {
    activeRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  const sidebarTasks = Array.from(
    view.querySelectorAll<HTMLElement>(
      '[data-testid="milestone-sidebar-task"]',
    ),
  );
  expect(sidebarTasks.map((item) => item.textContent)).toEqual([
    expect.stringContaining("b"),
    expect.stringContaining("a"),
  ]);
  expect(view.textContent).not.toContain("not-in-projection");
});
