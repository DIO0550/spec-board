// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn, userEvent, within } from "storybook/test";
import type { Column } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { CalendarView } from ".";

const pad2 = (value: number): string => String(value).padStart(2, "0");

const dateFromToday = (offset: number): string => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-");
};

const makeTask = (
  overrides: Partial<TaskPayload> & Pick<TaskPayload, "id" | "title">,
) =>
  Task.fromPayload({
    id: overrides.id,
    title: overrides.title,
    status: overrides.status ?? "Todo",
    priority: overrides.priority,
    milestone: overrides.milestone,
    due: overrides.due,
    labels: overrides.labels ?? [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: overrides.filePath ?? `tasks/${overrides.id}.md`,
  });

const designTasks = [
  makeTask({
    id: "today-review",
    title: "カレンダー表示をレビュー",
    status: "In Review",
    priority: "High",
    due: dateFromToday(0),
    labels: ["calendar", "design"],
  }),
  makeTask({
    id: "overdue",
    title: "期限超過タスクの警告色を調整",
    status: "In Progress",
    priority: "High",
    due: dateFromToday(-4),
    labels: ["bug"],
  }),
  makeTask({
    id: "done",
    title: "月グリッドの基礎実装",
    status: "Done",
    due: dateFromToday(-2),
    labels: ["frontend"],
  }),
  makeTask({
    id: "milestone",
    title: "v0.3 リリース",
    status: "Todo",
    priority: "High",
    milestone: "v0.3",
    due: dateFromToday(8),
    labels: ["milestone"],
  }),
  makeTask({
    id: "upcoming",
    title: "週表示の操作確認",
    status: "Todo",
    priority: "Medium",
    due: dateFromToday(3),
  }),
  makeTask({
    id: "today-2",
    title: "サイドバーの予定を確認",
    status: "Todo",
    due: dateFromToday(0),
  }),
  makeTask({
    id: "today-3",
    title: "ステータスfilterを確認",
    status: "Backlog",
    priority: "Low",
    due: dateFromToday(0),
  }),
  makeTask({
    id: "today-4",
    title: "overflow件数を確認",
    status: "In Progress",
    due: dateFromToday(0),
  }),
  makeTask({
    id: "undated",
    title: "期限を決める必要があるタスク",
    status: "Backlog",
    due: undefined,
  }),
];

const meta: Meta<typeof CalendarView> = {
  component: CalendarView,
  args: {
    tasks: designTasks,
    columns: [
      { name: "Backlog", order: 0 },
      { name: "Todo", order: 1 },
      { name: "In Progress", order: 2 },
      { name: "In Review", order: 3 },
      { name: "Done", order: 4 },
    ],
    doneColumn: "Done",
    onTaskClick: fn(),
    onAddTask: fn(),
  },
  argTypes: {
    tasks: { control: "object" },
    onTaskClick: { control: false },
    onAddTask: { control: false },
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="h-screen min-h-[720px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CalendarView>;

export const Default: Story = {};

export const AllProps: Story = {
  args: {
    tasks: designTasks,
    onTaskClick: fn(),
    onAddTask: fn(),
  },
};

export const EdgeCases: Story = {
  args: {
    tasks: [
      ...designTasks,
      makeTask({
        id: "long-title",
        title:
          "非常に長いタスクタイトルがカレンダーセルとサイドバーの横幅を超える状態を確認する",
        status: "Unknown Status",
        due: dateFromToday(0),
      }),
      makeTask({
        id: "invalid-due",
        title: "不正な期限文字列",
        due: "not-a-date",
      }),
    ],
  },
};

export const CompactDetail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [taskButton] = canvas.getAllByRole("button", {
      name: "カレンダー表示をレビュー",
    });
    await userEvent.click(taskButton);
  },
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

export const DetailOpen: Story = { ...CompactDetail, name: "Detail Open" };

const japaneseColumns: Column[] = [
  { name: "未着手", order: 0, color: "#1a2b3c" },
  { name: "進行中", order: 1 },
  { name: "レビュー中", order: 2, color: "#c2410c" },
  { name: "完了", order: 3, color: "#15803d" },
];

// designTasks の英語 status をそのまま渡すと全件が config 外扱いになり、
// config の color が反映される様子が見えない。この story 専用に status だけを
// 日本語へ差し替えたタスクを作る（designTasks は他 story と共有のため変更しない）。
const japaneseTasks = designTasks.map((task, index) =>
  makeTask({
    id: task.id,
    title: task.title,
    status: japaneseColumns[index % japaneseColumns.length].name,
    priority: task.priority,
    milestone: task.milestone,
    due: task.due,
    labels: [...task.labels],
    filePath: task.filePath,
  }),
);

export const JapaneseColumns: Story = {
  args: {
    tasks: japaneseTasks,
    columns: japaneseColumns,
    doneColumn: "完了",
    onTaskClick: fn(),
    onAddTask: fn(),
  },
};
