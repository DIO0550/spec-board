// @jsdoc-rules-disable
import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef } from "react";
import { ToastProvider, useToastDispatch } from "@/providers/ToastProvider";
import type { ToastItem } from "@/types/toast";
import { ToastContainer } from ".";

// Storybook では auto-dismiss で消えると視認できないため、Provider 経由で十分に長い
// duration を渡して story 表示中は実質固定表示にする。
const STORY_DURATION_MS = 1000 * 60 * 60;

const withToastProvider: Decorator = (Story) => (
  <ToastProvider defaultDurationMs={STORY_DURATION_MS}>
    <Story />
  </ToastProvider>
);

const SeedToasts = ({
  items,
}: {
  items: Pick<ToastItem, "message" | "type">[];
}) => {
  const { showToast } = useToastDispatch();
  // ref ガードで 1 回だけ seed する。items / showToast を依存に入れても、
  // この ref により再 push されないため Storybook で重複表示されない。
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;
    for (const t of items) {
      showToast(t.message, t.type);
    }
  }, [items, showToast]);
  return null;
};

const meta: Meta<typeof ToastContainer> = {
  component: ToastContainer,
  parameters: { layout: "fullscreen" },
  decorators: [withToastProvider],
};

export default meta;

type Story = StoryObj<typeof ToastContainer>;

export const Empty: Story = {
  render: () => <SeedToasts items={[]} />,
};

export const Single: Story = {
  render: () => (
    <SeedToasts items={[{ message: "保存しました", type: "success" }]} />
  ),
};

export const Multiple: Story = {
  render: () => (
    <SeedToasts
      items={[
        { message: "保存しました", type: "success" },
        { message: "通信に失敗しました", type: "error" },
        { message: "下書きが残っています", type: "warning" },
      ]}
    />
  ),
};

export const Default: Story = { ...Single };
export const AllProps: Story = { ...Multiple };
export const EdgeCases: Story = { ...Empty };
