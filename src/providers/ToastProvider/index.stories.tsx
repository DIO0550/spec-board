// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import type { ToastType } from "@/types/toast";
import { ToastProvider, useToasts } from ".";

const TOAST_EXAMPLES: readonly { type: ToastType; message: string }[] = [
  { type: "success", message: "タスクを作成しました" },
  { type: "warning", message: "リンク切れが 2 件あります" },
  { type: "error", message: "プロジェクトを開けませんでした" },
];

/** Providerのtoast stateとdispatchを操作・目視するconsumer harness。 */
const ToastConsumer = () => {
  const { toasts, showToast } = useToasts();
  return (
    <section className="w-[560px] rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        ToastProvider
      </p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">
        通知キュー: {toasts.length}件
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {TOAST_EXAMPLES.map((toast) => (
          <button
            key={toast.type}
            type="button"
            onClick={() => showToast(toast.message, toast.type)}
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground"
          >
            {toast.type}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            showToast("非常に長い通知メッセージ ".repeat(12), "warning")
          }
          className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground"
        >
          long
        </button>
      </div>
    </section>
  );
};

const meta = {
  component: ToastProvider,
  args: { children: <ToastConsumer />, defaultDurationMs: 60_000 },
} satisfies Meta<typeof ToastProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "success" }));
    await userEvent.click(canvas.getByRole("button", { name: "warning" }));
    await userEvent.click(canvas.getByRole("button", { name: "error" }));
  },
};
export const EdgeCases: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "long" }),
    );
  },
};
