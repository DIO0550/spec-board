import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectProvider, useProjectSessionActions, useProjectState } from ".";

type VisualProjectState = "idle" | "loading" | "loaded" | "error";

type ProjectConsumerProps = {
  /** Providerの非同期遷移を外部通信なしで目視するStory専用状態。 */
  visualState: VisualProjectState;
};

/** Providerのcontextと主要session actionを目視するconsumer harness。 */
const ProjectConsumer = ({ visualState }: ProjectConsumerProps) => {
  const { state } = useProjectState();
  const { reset } = useProjectSessionActions();
  const visualCopy = {
    idle: ["プロジェクト未選択", "フォルダを開くとタスクが読み込まれます"],
    loading: [
      "payments-service を読み込み中…",
      "設定・タスク・監視情報を同期しています",
    ],
    loaded: ["payments-service", "127 tasks · 4 columns · watcher active"],
    error: [
      "読み込みに失敗しました",
      "権限を確認して、もう一度プロジェクトを開いてください",
    ],
  } as const;
  const [title, detail] = visualCopy[visualState];
  return (
    <section className="w-[620px] rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          ProjectProvider
        </p>
        <span className="ml-auto rounded-full border border-border bg-surface-muted px-2 py-1 font-mono text-xs text-muted">
          context: {state.kind}
        </span>
      </div>
      <div
        className={`mt-4 rounded-lg border p-5 ${visualState === "error" ? "border-red-300 bg-red-50" : "border-border bg-surface-muted"}`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`size-3 rounded-full ${visualState === "loading" ? "animate-pulse bg-amber-500" : visualState === "loaded" ? "bg-green-600" : visualState === "error" ? "bg-red-600" : "bg-muted"}`}
          />
          <div>
            <h2 className="font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted">{detail}</p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-md border border-border px-3 py-2 text-sm text-foreground"
      >
        Contextをidleへ戻す
      </button>
    </section>
  );
};

type ProjectProviderHarnessProps = ProjectConsumerProps;

/** Storyのconsumerを実ProjectProviderへ接続するharness。 */
const ProjectProviderHarness = (props: ProjectProviderHarnessProps) => (
  <ProjectProvider>
    <ProjectConsumer {...props} />
  </ProjectProvider>
);

const meta = {
  component: ProjectProviderHarness,
  args: { visualState: "idle" },
  argTypes: {
    visualState: {
      control: "select",
      options: ["idle", "loading", "loaded", "error"],
    },
  },
} satisfies Meta<typeof ProjectProviderHarness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = { args: { visualState: "loaded" } };
export const EdgeCases: Story = { args: { visualState: "error" } };
export const Loading: Story = { args: { visualState: "loading" } };
