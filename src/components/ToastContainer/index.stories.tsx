// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ToastItem } from "@/types/toast";
import { ToastContainer } from ".";

const longDuration = 1000 * 60 * 60;

const meta: Meta<typeof ToastContainer> = {
  component: ToastContainer,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    toasts: [],
    onDismiss: () => {},
    duration: longDuration,
  },
};

export default meta;

type Story = StoryObj<typeof ToastContainer>;

export const Empty: Story = {
  args: { toasts: [] },
};

export const Single: Story = {
  args: {
    toasts: [
      {
        id: "t-1",
        message: "保存しました",
        type: "success",
      } satisfies ToastItem,
    ],
  },
};

export const Multiple: Story = {
  args: {
    toasts: [
      { id: "t-1", message: "保存しました", type: "success" },
      { id: "t-2", message: "通信に失敗しました", type: "error" },
      { id: "t-3", message: "下書きが残っています", type: "warning" },
    ] satisfies ToastItem[],
  },
};
