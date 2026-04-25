// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ToastItem } from "@/types/toast";
import { Toast } from ".";

const baseToast: ToastItem = {
  id: "toast-1",
  message: "保存しました",
  type: "success",
};

const meta: Meta<typeof Toast> = {
  component: Toast,
  args: {
    toast: baseToast,
    onDismiss: () => {},
    duration: 1000 * 60 * 60,
  },
};

export default meta;

type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: {
    toast: { id: "t-success", message: "保存しました", type: "success" },
  },
};

export const ErrorVariant: Story = {
  name: "Error",
  args: {
    toast: { id: "t-error", message: "通信に失敗しました", type: "error" },
  },
};

export const Warning: Story = {
  args: {
    toast: {
      id: "t-warning",
      message: "下書きが残っています",
      type: "warning",
    },
  },
};
