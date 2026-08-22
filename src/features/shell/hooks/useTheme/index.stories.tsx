// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { ThemeProvider, useTheme } from ".";

/** ThemeProvider の context state と更新操作を目視する Story 専用 consumer。 */
const ThemeConsumer = () => {
  const { appearance, resolvedTheme, setAccent, setDensity, setTheme } =
    useTheme();

  return (
    <section className="w-[520px] rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        ThemeProvider
      </p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">
        {appearance.theme} / {resolvedTheme}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {appearance.density} density · {appearance.accent} accent
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setTheme("dark")}>
          Dark
        </button>
        <button type="button" onClick={() => setTheme("system")}>
          System
        </button>
        <button type="button" onClick={() => setDensity("compact")}>
          Compact
        </button>
        <button type="button" onClick={() => setAccent("rose")}>
          Rose
        </button>
      </div>
    </section>
  );
};

/** 実 ThemeProvider と consumer を組み合わせる Story harness。 */
const ThemeProviderHarness = () => (
  <ThemeProvider>
    <ThemeConsumer />
  </ThemeProvider>
);

const meta = {
  component: ThemeProviderHarness,
} satisfies Meta<typeof ThemeProviderHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllProps: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Dark" }));
    await userEvent.click(canvas.getByRole("button", { name: "Compact" }));
    await userEvent.click(canvas.getByRole("button", { name: "Rose" }));
  },
};

export const EdgeCases: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "System" }),
    );
  },
};
