import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { type AppView, AppViewProvider, useAppView } from ".";

const VIEWS: readonly AppView[] = [
  "board",
  "settings",
  "detail",
  "milestone",
  "create",
];

/** Providerのview stateを操作・目視するconsumer harness。 */
const AppViewConsumer = () => {
  const { view, navigate } = useAppView();
  return (
    <section className="w-[520px] rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        AppViewProvider
      </p>
      <p
        className="mt-2 text-2xl font-semibold text-foreground"
        data-testid="app-view-current"
      >
        {view}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {VIEWS.map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => navigate(next)}
            className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground hover:border-accent"
          >
            {next}
          </button>
        ))}
      </div>
    </section>
  );
};

const meta = {
  component: AppViewProvider,
  args: { children: <AppViewConsumer /> },
} satisfies Meta<typeof AppViewProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const AllProps: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "detail" }),
    );
  },
};
export const EdgeCases: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "settings" }));
    await userEvent.click(canvas.getByRole("button", { name: "create" }));
  },
};
