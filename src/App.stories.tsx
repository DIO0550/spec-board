import type { Meta, StoryObj } from "@storybook/react-vite";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { type ReactNode, useEffect, useState } from "react";
import { fn } from "storybook/test";
import { TaskForest } from "@/domains/task-forest";
import { BoardWorkspace, HeaderBar } from "@/features/board";
import { AppSidebar, ThemeProvider } from "@/features/shell";
import {
  buildProjectionsFixture,
  initialColumns,
  initialTasks,
} from "@/test-fixtures";
import { App } from "./App";

type TauriMockBoundaryProps = {
  children: ReactNode;
};

/** App が mount 時に登録する Tauri event listener を browser 内で閉じる Story 境界。 */
const TauriMockBoundary = ({ children }: TauriMockBoundaryProps) => {
  useState(() => {
    mockIPC(() => undefined, { shouldMockEvents: true });
  });

  useEffect(() => clearMocks, []);

  return children;
};

const meta = {
  component: App,
  decorators: [
    (Story) => (
      <TauriMockBoundary>
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
