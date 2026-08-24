import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { CalendarView } from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 3, 26, 12));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

const makeTask = (overrides: Partial<TaskPayload>): Task =>
  Task.fromPayload({
    id: overrides.id ?? "task",
    title: overrides.title ?? "タスク",
    status: overrides.status ?? "Todo",
    priority: overrides.priority,
    milestone: overrides.milestone,
    due: overrides.due,
    labels: overrides.labels ?? [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: overrides.filePath ?? `tasks/${overrides.id ?? "task"}.md`,
  });

const renderCalendar = (tasks: Task[], onTaskClick = vi.fn()) => {
  act(() => {
    root?.render(createElement(CalendarView, { tasks, onTaskClick }));
  });
  return onTaskClick;
};

const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

test("月表示は外月日を含む42セルと320pxサイドバーを描画する", () => {
  renderCalendar([]);

  expect(container?.querySelectorAll("[data-calendar-date]")).toHaveLength(42);
  expect(
    container?.querySelector('[data-calendar-date="2026-03-29"]'),
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-calendar-date="2026-05-09"]'),
  ).not.toBeNull();
  expect(
    container?.querySelector(
      '[data-calendar-date="2026-04-26"][data-today="true"]',
    ),
  ).not.toBeNull();
  expect(container?.querySelector('[data-weekday="sun"]')).not.toBeNull();
  expect(container?.querySelector('[data-weekday="sat"]')).not.toBeNull();
  expect(
    container?.querySelector('[data-testid="calendar-sidebar"]')?.className,
  ).toContain("w-80");
});

test("todayを指定するとsystem clockではなく指定日を表示基準にする", () => {
  act(() => {
    root?.render(
      createElement(CalendarView, {
        tasks: [
          makeTask({
            id: "story-today",
            title: "固定日のタスク",
            due: "2026-08-23",
          }),
        ],
        today: "2026-08-23",
      }),
    );
  });

  expect(container?.textContent).toContain("2026年 8月");
  expect(
    container?.querySelector(
      '[data-calendar-date="2026-08-23"][data-today="true"]',
    ),
  ).not.toBeNull();
  const sidebar = container?.querySelector('[data-testid="calendar-sidebar"]');
  expect(sidebar?.textContent).toContain("2026-08-23");
  expect(sidebar?.textContent).toContain("固定日のタスク");
});

test.each([
  "not-a-date",
  "2026-02-29",
  "2026-13-01",
])("不正なtoday「%s」はsystem clockの日付へfallbackする", (today) => {
  act(() => {
    root?.render(createElement(CalendarView, { tasks: [], today }));
  });

  expect(container?.textContent).toContain("2026年 4月");
  expect(
    container?.querySelector(
      '[data-calendar-date="2026-04-26"][data-today="true"]',
    ),
  ).not.toBeNull();
  const sidebar = container?.querySelector('[data-testid="calendar-sidebar"]');
  expect(sidebar?.textContent).toContain("2026-04-26");
  expect(container?.textContent).not.toContain("NaN");
  expect(container?.textContent).not.toContain(today);
});

test("日付セルの追加ボタンはYYYY-MM-DD付きでコールバックを呼ぶ", () => {
  const onAddTask = vi.fn();
  act(() => {
    root?.render(createElement(CalendarView, { tasks: [], onAddTask }));
  });
  click(
    container?.querySelector('button[aria-label="2026-04-26にタスクを追加"]'),
  );
  expect(onAddTask).toHaveBeenCalledWith("2026-04-26");
});

test("期限超過・完了・優先度・3件超のmoreを日付セルへ表示する", () => {
  renderCalendar([
    makeTask({
      id: "overdue",
      title: "期限超過",
      due: "2026-04-20",
      priority: "High",
    }),
    makeTask({
      id: "done",
      title: "完了済み",
      due: "2026-04-20",
      status: "Done",
    }),
    makeTask({ id: "third", title: "3件目", due: "2026-04-20" }),
    makeTask({ id: "fourth", title: "4件目", due: "2026-04-20" }),
  ]);

  expect(
    container
      ?.querySelector('[data-task-id="overdue"]')
      ?.getAttribute("data-overdue"),
  ).toBe("true");
  expect(
    container?.querySelector('[data-task-id="overdue"] [data-priority="High"]'),
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-task-id="done"]')?.className,
  ).toContain("line-through");
  expect(container?.textContent).toContain("+ あと 1 件");
});

test("projectの完了カラムを期限超過判定と表示順へ使う", () => {
  act(() => {
    root?.render(
      createElement(CalendarView, {
        tasks: [
          makeTask({ id: "closed", status: "Closed", due: "2026-04-20" }),
        ],
        columns: [
          { name: "Queue", order: 1 },
          { name: "Closed", order: 0 },
        ],
        doneColumn: "Closed",
      }),
    );
  });
  const event = container?.querySelector('[data-task-id="closed"]');
  expect(event?.getAttribute("data-overdue")).toBe("false");
  expect(event?.className).toContain("line-through");
  const filters = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ??
      [],
  ).map((input) => input.value);
  expect(filters.slice(0, 2)).toEqual(["Closed", "Queue"]);
});

test("ステータスfilterを外すと対象eventとサイドバー予定が非表示になる", () => {
  renderCalendar([
    makeTask({
      id: "todo",
      title: "Todoの予定",
      due: "2026-04-26",
      status: "Todo",
    }),
    makeTask({
      id: "done",
      title: "Doneの予定",
      due: "2026-04-26",
      status: "Done",
    }),
  ]);
  const todoCheckbox = container?.querySelector<HTMLInputElement>(
    'input[value="Todo"]',
  );

  act(() => {
    todoCheckbox?.click();
  });

  expect(container?.querySelector('[data-task-id="todo"]')).toBeNull();
  expect(container?.querySelector('[data-task-id="done"]')).not.toBeNull();
});

test("月週segmentedと前後・今日navigationが表示範囲を更新する", () => {
  renderCalendar([]);
  expect(container?.textContent).toContain("2026年 4月");

  click(container?.querySelector('button[aria-label="次の月"]'));
  expect(container?.textContent).toContain("2026年 5月");
  click(container?.querySelector("button[data-range='week']"));
  expect(container?.querySelectorAll("[data-calendar-date]")).toHaveLength(7);
  expect(
    container
      ?.querySelector("button[data-range='week']")
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
  click(container?.querySelector('button[aria-label="今日を表示"]'));
  expect(
    container?.querySelector('[data-calendar-date="2026-04-26"]'),
  ).not.toBeNull();
});

test("期限なしtaskを専用sectionへ表示する", () => {
  renderCalendar([
    makeTask({ id: "undated", title: "期限が未設定", due: undefined }),
    makeTask({ id: "invalid", title: "期限が不正", due: "not-a-date" }),
  ]);

  const section = container?.querySelector('[data-testid="calendar-undated"]');
  expect(section?.textContent).toContain("期限なし");
  expect(section?.textContent).toContain("期限が未設定");
  expect(section?.textContent).toContain("期限が不正");
});

test("task clickは既存callbackを呼びcompact detailを開閉する", () => {
  const onTaskClick = renderCalendar([
    makeTask({
      id: "detail",
      title: "詳細を確認するタスク",
      due: "2026-04-26",
      priority: "Medium",
      labels: ["feature", "calendar"],
    }),
  ]);

  click(container?.querySelector('[data-task-id="detail"]'));

  expect(onTaskClick).toHaveBeenCalledWith("detail");
  expect(
    container?.querySelector('[data-testid="calendar-detail"]')?.textContent,
  ).toContain("詳細を確認するタスク");
  expect(
    container?.querySelector('[data-testid="calendar-detail"]')?.className,
  ).toContain("w-[480px]");

  click(container?.querySelector('button[aria-label="詳細を閉じる"]'));
  expect(
    container?.querySelector('[data-testid="calendar-detail"]'),
  ).toBeNull();
});
