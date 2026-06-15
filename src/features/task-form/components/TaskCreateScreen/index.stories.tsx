// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ThemeProvider } from "@/features/shell";
import { initialColumns, initialTasks } from "@/test-fixtures";
import { TaskCreateScreen } from ".";

const meta: Meta<typeof TaskCreateScreen> = {
  component: TaskCreateScreen,
  // 全画面 chrome を持つため fullscreen レイアウトで表示する。
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div style={{ height: "100vh", width: "100vw" }}>
          <Story />
        </div>
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
    onSubmit: fn(async () => {}),
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
