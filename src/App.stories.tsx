// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { type ReactNode, useEffect, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { TaskForest } from "@/domains/task-forest";
import { BoardWorkspace, HeaderBar } from "@/features/board";
import { AppSidebar, ThemeProvider } from "@/features/shell";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import type { TaskPayload } from "@/types/task";
import { App } from "./App";

type TauriMockBoundaryProps = {
  children: ReactNode;
  loadedProject?: boolean;
};

const loadedTaskPayloads: TaskPayload[] = initialTasks.map((task) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  milestone: task.milestone,
  due: task.due,
  draft: task.draft,
  labels: [...task.labels],
  parent: task.hierarchy.parentFilePath,
  links: [...task.links.linkedFilePaths],
  children: [...task.hierarchy.childFilePaths],
  reverseLinks: [...task.links.reverseLinkedFilePaths],
  body: task.body,
  filePath: task.filePath,
  extras: task.extras,
  warnings: task.warnings,
}));

/** App が mount 時に登録する Tauri event listener を browser 内で閉じる Story 境界。 */
const TauriMockBoundary = ({
  children,
  loadedProject = false,
}: TauriMockBoundaryProps) => {
  useState(() => {
    mockIPC(
      (command) => {
        if (!loadedProject) {
          return undefined;
        }
        if (command === "plugin:dialog|open") {
          return "/workspace/payments-service";
        }
        if (command === "open_project") {
          return {
            tasks: loadedTaskPayloads,
            columns: initialColumns.map((column) => column.name),
            projections: Object.fromEntries(
              initialTasks.map((task) => [
                task.filePath,
                {
                  subIssueProgress: { done: 0, total: 0 },
                  isDone: task.status === "Done",
                  childFilePaths: task.hierarchy.childFilePaths,
                },
              ]),
            ),
            milestoneProjections: {},
            taskTree: initialTasks.map((task) => ({
              filePath: task.filePath,
              children: [],
            })),
            loadWarnings: [],
            session: {
              projectKey: "/workspace/payments-service",
              generation: 1,
              revision: 1,
              eventSeq: 0,
            },
          };
        }
        if (command === "get_columns") {
          return { columns: initialColumns, doneColumn: "Done" };
        }
        if (command === "get_labels") {
          return { labels: [], usageCounts: {} };
        }
        if (command === "get_milestones") {
          return { milestones: [], usageCounts: {} };
        }
        if (command === "get_config_files") {
          return { files: [] };
        }
        return undefined;
      },
      { shouldMockEvents: true },
    );
  });
  useEffect(
    () => () => {
      window.setTimeout(clearMocks, 0);
    },
    [],
  );

  return children;
};

const meta = {
  component: App,
  decorators: [
    (Story, context) => (
      <TauriMockBoundary
        loadedProject={context.parameters.loadedProject === true}
      >
        <Story />
      </TauriMockBoundary>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllProps: Story = {
  globals: { theme: "dark", density: "comfortable", accent: "violet" },
};

export const EdgeCases: Story = {
  globals: { theme: "light", density: "compact", accent: "amber" },
  parameters: { viewport: { defaultViewport: "compact924" } },
};

export const CommandPaletteKeyboard: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.keyboard("{Control>}k{/Control}");
    await expect(
      within(canvasElement).getByRole("dialog", { name: "グローバル検索" }),
    ).toBeVisible();
  },
};

export const LoadedProjectComposition: Story = {
  parameters: { loadedProject: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "開く" }));
    await waitFor(() => {
      const todoColumn = canvasElement.querySelector(
        '[data-testid="column-Todo"]',
      );
      if (todoColumn === null) {
        throw new Error("Todo column was not rendered");
      }
      const card = todoColumn.querySelector('[data-testid="task-card"]');
      if (card?.textContent?.includes("ログイン画面のバグ修正") !== true) {
        throw new Error("Loaded project card was not rendered");
      }
    });
  },
};

const compositionTaskTree = TaskForest.fromPayload(
  initialTasks.map((task) => ({ filePath: task.filePath, children: [] })),
);

export const ShellBoardComposition: Story = {
  render: () => (
    <ThemeProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-bg">
        <AppSidebar
          projectName="spec-board"
          currentPath="/workspace/spec-board"
          recentProjects={[]}
          tasks={initialTasks}
          selectedTaskId={initialTasks[0]?.id}
          collapsed={false}
          onToggle={fn()}
          onOpenProject={fn()}
          onOpenProjectPath={fn()}
          onSelectTask={fn()}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <HeaderBar view="board" onSettingsClick={fn()} onOpenClick={fn()} />
          <div className="min-h-0 flex-1">
            <BoardWorkspace
              columns={initialColumns}
              tasks={initialTasks}
              doneColumn="Done"
              projections={buildProjectionsFixture(initialTasks, "Done")}
              taskTree={compositionTaskTree}
              milestones={[]}
              milestonesByName={new Map()}
              onAddTask={fn()}
              onTaskClick={fn()}
              onAddColumn={fn()}
              onRenameColumn={fn()}
              onDeleteColumn={fn()}
              onTaskDrop={fn()}
              onColumnReorder={fn()}
              onLabelFilterApplied={fn()}
            />
          </div>
        </div>
      </div>
    </ThemeProvider>
  ),
};
