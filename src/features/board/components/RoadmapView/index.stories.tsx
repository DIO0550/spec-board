import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import { Task, type TaskPayload } from "@/types/task";
import { RoadmapView } from ".";

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: "task",
    title: "タスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/task.md",
    extras: { start: "2026-04-20" },
    due: "2026-04-28",
    ...overrides,
  });

const epics = [
  makeTask({
    id: "auth",
    title: "認証基盤の刷新",
    status: "In Progress",
    filePath: "tasks/auth.md",
    children: ["tasks/login.md", "tasks/session.md"],
    extras: { start: "2026-04-18" },
    due: "2026-05-06",
  }),
  makeTask({
    id: "login",
    title: "ログイン画面",
    status: "Done",
    filePath: "tasks/login.md",
    parent: "tasks/auth.md",
    extras: { start: "2026-04-20" },
    due: "2026-04-25",
  }),
  makeTask({
    id: "session",
    title: "セッション管理",
    status: "In Progress",
    filePath: "tasks/session.md",
    parent: "tasks/auth.md",
    extras: { start: "2026-04-24" },
    due: "2026-05-03",
  }),
  makeTask({
    id: "mobile",
    title: "モバイル体験の改善",
    status: "Todo",
    filePath: "tasks/mobile.md",
    extras: { start: "2026-04-27" },
    due: "2026-05-15",
  }),
];

const columns = [
  { name: "Todo", order: 0, color: "#64748b" },
  { name: "In Progress", order: 1, color: "#3b82f6" },
  { name: "Done", order: 2, color: "#22c55e" },
];

const scrollEpics = Array.from({ length: 24 }, (_, index) =>
  makeTask({
    id: `scroll-epic-${index + 1}`,
    title: `スクロール検証 Epic ${String(index + 1).padStart(2, "0")}`,
    status: columns[index % columns.length].name,
    filePath: `tasks/scroll-epic-${index + 1}.md`,
    extras: { start: index === 0 ? "2026-02-01" : "2026-04-01" },
    due: index === 0 ? "2026-08-31" : "2026-05-31",
  }),
);

const meta = {
  component: RoadmapView,
  args: {
    tasks: epics,
    columns,
    doneColumn: "Done",
    today: "2026-04-26",
    onAddEpic: fn(),
    onTaskClick: fn(),
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[540px] min-w-[920px] bg-surface">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoadmapView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllProps: Story = {
  args: { defaultExpanded: true },
};

export const EdgeCases: Story = {
  args: {
    tasks: [
      makeTask({
        id: "long",
        title:
          "非常に長いEpic名でも固定ラベル領域と横スクロールを壊さないことを確認する".repeat(
            2,
          ),
        status: "Unknown",
        filePath: "tasks/long.md",
        extras: { start: "2026-03-01" },
        due: "2026-06-30",
      }),
      makeTask({
        id: "reverse",
        title: "開始・終了の逆転を補正",
        status: "Todo",
        filePath: "tasks/reverse.md",
        extras: { start: "2026-05-12", end: "2026-05-01" },
      }),
    ],
  },
};

export const Collapsed: Story = {
  args: { defaultExpanded: false },
};

export const Empty: Story = {
  args: { tasks: [] },
};

export const Week: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "週" }),
    );
  },
};

export const ScrollSticky: Story = {
  args: { tasks: scrollEpics },
  parameters: { viewport: { defaultViewport: "compact924" } },
  play: async ({ canvasElement }) => {
    const scroll = canvasElement.querySelector<HTMLElement>(
      "[data-roadmap-scroll]",
    );
    if (scroll !== null) {
      scroll.scrollLeft = 420;
      scroll.scrollTop = 96;
      scroll.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  },
};
