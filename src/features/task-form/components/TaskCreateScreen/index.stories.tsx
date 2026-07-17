// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Task } from "@/domains/task";
import { ThemeProvider } from "@/features/shell";
import type { CreateTaskSubmitOutcome } from "@/features/task-form/hooks/useTaskCreate";
import { ToastProvider } from "@/providers/ToastProvider";
import { initialColumns, initialTasks } from "@/test-fixtures";
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

const meta: Meta<typeof TaskCreateScreen> = {
  component: TaskCreateScreen,
  // 全画面 chrome を持つため fullscreen レイアウトで表示する。
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <ToastProvider>
          <div style={{ height: "100vh", width: "100vw" }}>
            <Story />
          </div>
        </ToastProvider>
      </ThemeProvider>
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
