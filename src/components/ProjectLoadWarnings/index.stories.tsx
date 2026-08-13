// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectLoadWarning } from "@/domains/project-load-warning";
import { ProjectLoadWarnings } from ".";

const unreadableWarning = ProjectLoadWarning.fromPayload({
  code: "unreadableFile",
  stage: "read",
  path: "tasks/private-task.md",
  message: "ファイルを読み取る権限がありませんでした。",
  recoverable: true,
});

const parseWarning = ProjectLoadWarning.fromPayload({
  code: "frontmatterParseFailed",
  stage: "parse",
  path: "tasks/invalid-frontmatter.md",
  message: "frontmatterの形式が正しくないため既定値を使用しました。",
  recoverable: true,
});

const meta: Meta<typeof ProjectLoadWarnings> = {
  component: ProjectLoadWarnings,
  args: { warnings: [unreadableWarning] },
  argTypes: { warnings: { control: "object" } },
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof ProjectLoadWarnings>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { warnings: [unreadableWarning, parseWarning] },
};
export const EdgeCases: Story = {
  args: {
    warnings: [
      ProjectLoadWarning.fromPayload({
        code: "unknown-code",
        stage: "unknown-stage",
        path: "very/deeply/nested/path/to/a/problematic-task-file.md",
        message: "",
        recoverable: true,
      }),
    ],
  },
};
export const Empty: Story = { args: { warnings: [] } };
