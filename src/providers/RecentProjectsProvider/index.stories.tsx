import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { RECENT_PROJECTS_STORAGE_KEY } from "@/hooks/useRecentProjects/helpers";
import { RecentProjectsProvider, useRecentProjects } from ".";

/** Providerの履歴一覧とadd操作を目視するconsumer harness。 */
const RecentProjectsConsumer = () => {
  const { projects, add } = useRecentProjects();
  return (
    <section className="w-[600px] rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            RecentProjectsProvider
          </p>
          <h2 className="text-lg font-semibold text-foreground">
            最近開いたプロジェクト
          </h2>
        </div>
        <span className="ml-auto rounded-full bg-accent-soft px-2 py-1 text-xs text-accent">
          {projects.length}件
        </span>
      </div>
      {projects.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          履歴はありません
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {projects.map((project) => (
            <li key={project.path} className="px-3 py-2.5">
              <p className="font-medium text-foreground">{project.name}</p>
              <p className="truncate font-mono text-xs text-muted">
                {project.path}
              </p>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => add("/workspace/new-project")}
        className="mt-4 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground"
      >
        履歴へ追加
      </button>
    </section>
  );
};

/** StoryごとのlocalStorage fixtureをProvider mount前に設定するdecorator。 */
const withRecentProjects =
  (paths: readonly string[]): Decorator =>
  (Story) => {
    localStorage.setItem(
      RECENT_PROJECTS_STORAGE_KEY,
      JSON.stringify(
        paths.map((path) => {
          const segments = path.split("/");
          return { path, name: segments[segments.length - 1] ?? path };
        }),
      ),
    );
    return <Story />;
  };

const meta = {
  component: RecentProjectsProvider,
  args: { children: <RecentProjectsConsumer /> },
} satisfies Meta<typeof RecentProjectsProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { decorators: [withRecentProjects([])] };
export const AllProps: Story = {
  decorators: [
    withRecentProjects([
      "/workspace/spec-board",
      "/workspace/payments-service",
      "/workspace/design-system",
    ]),
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "履歴へ追加" }),
    );
  },
};
export const EdgeCases: Story = {
  decorators: [
    withRecentProjects(
      Array.from(
        { length: 10 },
        (_, index) =>
          `/workspace/${"very-long-segment/".repeat(4)}project-${index + 1}`,
      ),
    ),
  ],
};
