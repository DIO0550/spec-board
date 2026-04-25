// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@/components/Button";
import { TaskFormActions } from ".";

const meta: Meta<typeof TaskFormActions> = {
  component: TaskFormActions,
  args: {
    children: (
      <>
        <Button variant="secondary">キャンセル</Button>
        <Button variant="primary" type="submit">
          作成
        </Button>
      </>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormActions>;

export const Default: Story = {};
