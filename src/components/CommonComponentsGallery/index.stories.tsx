import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { Button } from "@/components/Button";
import { PopoverSelect } from "@/components/PopoverSelect";
import { TabNav } from "@/components/TabNav";
import { Toast } from "@/components/Toast";

const noop = fn();
const sectionClassName =
  "rounded-xl border border-border bg-surface p-4 shadow-sm";
const labelClassName =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";
const inputClassName =
  "h-[30px] rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft";

/** @returns 共通コンポーネントを一覧表示するギャラリー */
const CommonComponentsGallery = () => (
  <main className="min-h-screen bg-background p-6 text-foreground">
    <header className="mb-5">
      <h1 className="m-0 text-2xl font-semibold">Common components</h1>
      <p className="mt-1 text-sm text-muted">
        Controls, feedback, navigation, and compact data primitives.
      </p>
    </header>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <section className={sectionClassName}>
        <h2 className="mb-3 text-sm font-semibold">Buttons</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button variant="primary" aria-busy="true">
            <span aria-hidden="true" className="animate-spin">
              ◌
            </span>
            Loading
          </Button>
          <Button data-testid="gallery-focus-button" variant="ghost">
            Focus ring
          </Button>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="mb-3 text-sm font-semibold">Form</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={labelClassName}>Project name</span>
            <input
              className={`${inputClassName} w-full`}
              defaultValue="spec-board"
            />
          </label>
          <label>
            <span className={labelClassName}>Status</span>
            <select className={`${inputClassName} w-full`} defaultValue="todo">
              <option value="todo">Todo</option>
              <option value="progress">In Progress</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelClassName}>Description</span>
            <textarea
              className="min-h-16 w-full rounded-md border border-border bg-background p-2.5 text-sm"
              defaultValue="Reference-aligned component states"
            />
          </label>
          <label>
            <span className={labelClassName}>Validation</span>
            <input
              aria-invalid="true"
              className={`${inputClassName} w-full border-danger`}
              defaultValue="Invalid value"
            />
          </label>
          <label>
            <span className={labelClassName}>Disabled</span>
            <input
              className={`${inputClassName} w-full`}
              disabled
              value="Unavailable"
              readOnly
            />
          </label>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="mb-3 text-sm font-semibold">Badges & avatars</h2>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-accent-soft px-2 py-1 text-accent">
            In Progress
          </span>
          <span className="rounded-full border border-border px-2 py-1">
            frontend
          </span>
          <span className="rounded-full bg-danger-soft px-2 py-1 text-danger">
            High
          </span>
          <span className="rounded-full bg-success-soft px-2 py-1 text-success">
            12 done
          </span>
        </div>
        <div className="flex items-center gap-3">
          {["MI", "RN", "SR"].map((initials, index) => (
            <span
              key={initials}
              className={`relative grid rounded-full bg-accent-soft text-accent ${index === 0 ? "size-10" : "size-8"} place-items-center text-xs font-semibold`}
            >
              {initials}
              {index === 0 && (
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-surface bg-success" />
              )}
            </span>
          ))}
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="mb-3 text-sm font-semibold">Menu & popover</h2>
        <div
          role="menu"
          aria-label="Task actions"
          className="mb-4 w-[232px] rounded-lg border border-border-strong bg-panel p-1.5 text-sm shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-md px-2.5 py-2 text-left hover:bg-surface-muted"
          >
            Edit <kbd className="ml-auto text-xs text-muted">E</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full rounded-md bg-accent-soft px-2.5 py-2 text-left text-accent"
          >
            Duplicate <span className="ml-auto">✓</span>
          </button>
          <hr className="my-1 border-0 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-md px-2.5 py-2 text-left text-danger hover:bg-danger-soft"
          >
            Delete
          </button>
        </div>
        <PopoverSelect
          label="Priority"
          value="medium"
          disabled={false}
          data-testid="gallery-popover"
          onChange={noop}
          options={[
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
      </section>

      <section className={`${sectionClassName} overflow-hidden`}>
        <h2 className="mb-3 text-sm font-semibold">Navigation & choices</h2>
        <div className="-mx-4 mb-4">
          <TabNav
            tabs={[
              { id: "board", label: "Board", count: 24 },
              { id: "list", label: "List" },
              { id: "roadmap", label: "Roadmap" },
            ]}
            activeTabId="board"
            idPrefix="gallery"
            ariaLabel="View"
            onSelect={noop}
          />
        </div>
        <div className="mb-3 inline-flex rounded-md border border-border bg-surface-muted p-0.5">
          <button
            type="button"
            aria-pressed="true"
            className="h-7 rounded bg-surface px-3 text-xs shadow-sm"
          >
            List
          </button>
          <button
            type="button"
            aria-pressed="false"
            className="h-7 px-3 text-xs text-muted"
          >
            Grid
          </button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> Checkbox
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="gallery-radio" defaultChecked /> Radio A
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="gallery-radio" /> Radio B
          </label>
          <button
            type="button"
            role="switch"
            aria-checked="true"
            className="flex items-center gap-2"
          >
            <span className="flex h-5 w-9 justify-end rounded-full bg-accent p-0.5">
              <span className="size-4 rounded-full bg-white" />
            </span>{" "}
            Switch
          </button>
        </div>
      </section>

      <section className={sectionClassName}>
        <h2 className="mb-3 text-sm font-semibold">Toasts</h2>
        <div className="flex flex-col gap-2">
          <Toast
            toast={{
              id: "success",
              type: "success",
              message: "Changes saved successfully",
            }}
            duration={600_000}
            onDismiss={noop}
          />
          <Toast
            toast={{
              id: "warning",
              type: "warning",
              message: "A newer version is available",
            }}
            duration={600_000}
            onDismiss={noop}
          />
        </div>
      </section>
    </div>
  </main>
);

const meta = {
  component: CommonComponentsGallery,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommonComponentsGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {};
export const EdgeCases: Story = {
  decorators: [
    (Story) => (
      <div className="max-w-[924px]">
        <Story />
      </div>
    ),
  ],
};
export const Comfortable: Story = {
  /** 余白広めの density で表示する。 */
  play: async () => {
    document.documentElement.dataset.density = "comfortable";
  },
};
export const Compact: Story = {
  /** 余白狭めの density で表示する。 */
  play: async () => {
    document.documentElement.dataset.density = "compact";
  },
};
export const Dark: Story = {
  /** dark テーマで表示する。 */
  play: async () => {
    document.documentElement.dataset.theme = "dark";
  },
};
export const Focus: Story = {
  /**
   * フォーカスリングの見え方を確認するため、ボタンへフォーカスを当てる。
   * @param context - story の描画コンテキスト
   */
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.tab();
    canvas.getByTestId("gallery-focus-button").focus();
  },
};
