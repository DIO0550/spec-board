// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { type ReactNode, useEffect, useState } from "react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@/features/shell";
import type { CreateTaskSubmitOutcome } from "@/features/task-form/hooks/useTaskCreate";
import { ProjectError } from "@/providers/ProjectProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { Task } from "@/types/task";
import { Result } from "@/utils/result";
import { TaskCreateScreen } from ".";

const STUB_PARENT_OUTCOME: CreateTaskSubmitOutcome = {
  parent: Task.fromPayload({
    id: "p-stub",
    title: "stub parent",
    status: initialColumns[0]?.name ?? "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/stub-parent.md",
  }),
  failedSubIssues: [],
};

type TauriPreviewMockBoundaryProps = {
  children: ReactNode;
};

/** Task preview が利用する2つのIPCをbrowser内に閉じるStory境界。 */
const TauriPreviewMockBoundary = ({
  children,
}: TauriPreviewMockBoundaryProps) => {
  useState(() => {
    mockIPC((command) => {
      if (command === "preview_task_filename") {
        return {
          kind: "path",
          fileName: "new-issue.md",
          relPath: "tasks/new-issue.md",
          fullPath: "/workspace/payments-service/tasks/new-issue.md",
        };
      }
      if (command === "preview_task_markdown") {
        return "---\ntitle: New issue\nstatus: Todo\n---\n";
      }
      return undefined;
    });
  });

  useEffect(() => clearMocks, []);

  return children;
};

const meta: Meta<typeof TaskCreateScreen> = {
  component: TaskCreateScreen,
  // 全画面 chrome を持つため fullscreen レイアウトで表示する。
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <TauriPreviewMockBoundary>
        <ThemeProvider>
          <ToastProvider>
            <div style={{ height: "100vh", width: "100vw" }}>
              <Story />
            </div>
          </ToastProvider>
        </ThemeProvider>
      </TauriPreviewMockBoundary>
    ),
  ],
  args: {
    columns: initialColumns,
    initialStatus: initialColumns[0]?.name ?? "Todo",
    parentCandidates: initialTasks,
    existingTasks: initialTasks,
    projectName: "payments-service",
    projectPath: "~/work/payments-service",
    watchedFileCount: 127,
    onSubmit: fn(async () => Result.ok(STUB_PARENT_OUTCOME)),
    onClose: fn(),
  },
};

export default meta;

type Story = StoryObj<typeof TaskCreateScreen>;

export const Default: Story = {};

export const AllProps: Story = {
  args: {
    initialParent: initialTasks[0]?.filePath,
    parentReadOnly: false,
  },
};

export const EdgeCases: Story = {
  args: {
    projectName: "非常に長いプロジェクト名".repeat(6),
    projectPath: `/workspace/${"nested/".repeat(12)}`,
    watchedFileCount: 99999,
  },
};

export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByTestId("task-form-title"),
      "検索結果ページのページネーション",
    );
    await userEvent.type(
      canvas.getByTestId("task-form-body"),
      "## 概要\n\n検索結果をページ単位で表示します。",
    );
    fireEvent.change(canvas.getByTestId("task-form-due"), {
      target: { value: "2026-09-18" },
    });
  },
};

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("task-topbar-preview-toggle"),
    );
  },
};

export const Submitting: Story = {
  args: {
    onSubmit: fn(
      () =>
        new Promise<Result<CreateTaskSubmitOutcome, ProjectError>>(() => {}),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByTestId("task-form-title"), "作成中タスク");
    await userEvent.click(canvas.getByTestId("task-form-submit"));
  },
};

export const ErrorState: Story = {
  name: "Error",
  args: {
    onSubmit: fn(async () =>
      Result.err(ProjectError.invalidState("保存に失敗しました")),
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByTestId("task-form-title"),
      "失敗するタスク",
    );
    await userEvent.click(canvas.getByTestId("task-form-submit"));
  },
};

export const SubIssue: Story = {
  args: {
    initialParent: initialTasks[0]?.filePath,
    parentReadOnly: true,
  },
};

export const EmptyProject: Story = {
  args: {
    parentCandidates: [],
    existingTasks: [],
    watchedFileCount: 0,
  },
};

export const StatusPopoverOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId("status-field"));
  },
};

export const PriorityPopoverOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId("priority-field"));
  },
};

export const LabelsPopoverOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("task-form-labels"),
    );
  },
};

export const ParentPopoverOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByTestId("parent-task-input"),
    );
  },
};

export const Resized: Story = {
  parameters: { viewport: { defaultViewport: "desktop1440" } },
  play: async ({ canvasElement }) => {
    const resizer = within(canvasElement).getByTestId("preview-resizer");
    fireEvent.pointerDown(resizer, { pointerId: 1, clientX: 960 });
    fireEvent.pointerMove(resizer, { pointerId: 1, clientX: 900 });
    fireEvent.pointerUp(resizer, { pointerId: 1, clientX: 900 });

    const grid = canvasElement.querySelector<HTMLElement>(
      "[style*='--preview-w']",
    );
    await expect(grid?.style.getPropertyValue("--preview-w")).toBe("540px");
  },
};
