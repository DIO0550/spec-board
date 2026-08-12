import { useEffect, useMemo, useState } from "react";
import { Due } from "@/domains/due";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";
import {
  addMonth,
  bucketTasksByDue,
  type YearMonth,
} from "../../lib/calendarMonth";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const MONTH_NAMES = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;
const PREFERRED_STATUS_ORDER = [
  "Backlog",
  "Todo",
  "In Progress",
  "In Review",
  "Done",
] as const;
const MONTH_CELL_COUNT = 42;
const MAX_VISIBLE_EVENTS = 3;
const UPCOMING_DAYS = 21;
const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

type CalendarRange = "month" | "week";

type CalendarViewProps = {
  /** 表示するタスク一覧（絞り込み済み） */
  tasks: Task[];
  /** project設定順のstatus column。 */
  columns?: readonly Column[];
  /** project設定の完了status。 */
  doneColumn?: string;
  /**
   * 日付セル内のタスククリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick?: (taskId: string) => void;
  /** 指定日を初期値にタスク作成を開くコールバック。 */
  onAddTask?: (date: string) => void;
};

type CalendarCell = {
  readonly date: string;
  readonly day: number;
  readonly month: number;
  readonly weekday: number;
};

/** @returns 数値を2桁へゼロ埋めした文字列 */
const pad2 = (value: number): string => String(value).padStart(2, "0");

/** @returns Dateのローカル日付文字列 */
const toDateString = (date: Date): string =>
  [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join(
    "-",
  );

/** @returns YYYY-MM-DDをローカル正午として解釈したDate */
const fromDateString = (date: string): Date => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};

/** @returns 基準日にdelta日を加えた日付文字列 */
const addDays = (date: string, delta: number): string => {
  const next = fromDateString(date);
  next.setDate(next.getDate() + delta);
  return toDateString(next);
};

/** @returns 月表示用の外月日を含む42セル */
const buildMonthCells = (visibleMonth: YearMonth): CalendarCell[] => {
  const first = new Date(visibleMonth.year, visibleMonth.month - 1, 1, 12);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: MONTH_CELL_COUNT }, (_unused, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return {
      date: toDateString(date),
      day: date.getDate(),
      month: date.getMonth() + 1,
      weekday: date.getDay(),
    };
  });
};

/** @returns anchorDateを含む日曜始まりの7セル */
const buildWeekCells = (anchorDate: string): CalendarCell[] => {
  const first = fromDateString(anchorDate);
  first.setDate(first.getDate() - first.getDay());
  return Array.from({ length: DAYS_PER_WEEK }, (_unused, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return {
      date: toDateString(date),
      day: date.getDate(),
      month: date.getMonth() + 1,
      weekday: date.getDay(),
    };
  });
};

/** @returns to - fromの日数 */
const daysBetween = (from: string, to: string): number => {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      MS_PER_DAY,
  );
};

/** @returns 日付文字列が属する年月 */
const yearMonthOf = (date: string): YearMonth => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7)),
});

/** @returns 既定順と未知status末尾で並べたstatus一覧 */
const statusListOf = (
  tasks: readonly Task[],
  columns?: readonly Column[],
): string[] => {
  const found = new Set(tasks.map((task) => task.status));
  if (columns !== undefined) {
    const configured = [...columns]
      .sort((left, right) => left.order - right.order)
      .map((column) => column.name);
    const configuredSet = new Set(configured);
    return [
      ...configured,
      ...[...found].filter((status) => !configuredSet.has(status)).sort(),
    ];
  }
  const preferred = PREFERRED_STATUS_ORDER.filter((status) =>
    found.has(status),
  );
  const extra = [...found]
    .filter(
      (status) =>
        !PREFERRED_STATUS_ORDER.includes(
          status as (typeof PREFERRED_STATUS_ORDER)[number],
        ),
    )
    .sort();
  return [...preferred, ...extra];
};

/** @returns statusに対応するevent配色class */
const statusEventClass = (status: string): string => {
  const styles: Record<string, string> = {
    Backlog: "border-l-zinc-400 bg-zinc-500/10",
    Todo: "border-l-blue-600 bg-blue-500/10",
    "In Progress": "border-l-amber-500 bg-amber-500/10",
    "In Review": "border-l-violet-500 bg-violet-500/10",
    Done: "border-l-green-600 bg-green-500/10",
  };
  return styles[status] ?? "border-l-slate-400 bg-slate-500/10";
};

/** @returns statusに対応するdot配色class */
const statusDotClass = (status: string): string => {
  const styles: Record<string, string> = {
    Backlog: "bg-zinc-400",
    Todo: "bg-blue-600",
    "In Progress": "bg-amber-500",
    "In Review": "bg-violet-500",
    Done: "bg-green-600",
  };
  return styles[status] ?? "bg-slate-400";
};

/** @returns priorityに対応するdot配色class */
const priorityDotClass = (priority: Task["priority"]): string => {
  if (priority === "High") {
    return "bg-red-600";
  }
  if (priority === "Medium") {
    return "bg-amber-500";
  }
  return priority === "Low" ? "bg-blue-500" : "";
};

/** @returns taskのファイル名 */
const taskFileName = (task: Task): string =>
  task.filePath.split("/").pop() ?? task.filePath;

/**
 * 月/週navigation、status filter、320px sidebar、compact detailを備えたcalendar。
 * @param props - CalendarView props
 * @returns calendar view
 */
export const CalendarView = ({
  tasks,
  columns,
  doneColumn = "Done",
  onTaskClick,
  onAddTask,
}: CalendarViewProps) => {
  const today = Due.todayLocal();
  const [visibleMonth, setVisibleMonth] = useState<YearMonth>(() =>
    yearMonthOf(today),
  );
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [range, setRange] = useState<CalendarRange>("month");
  const [disabledStatuses, setDisabledStatuses] = useState<Set<string>>(
    () => new Set(),
  );
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (selectedTask === null) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTask(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedTask]);

  const statuses = useMemo(
    () => statusListOf(tasks, columns),
    [tasks, columns],
  );
  const filteredTasks = useMemo(
    () => tasks.filter((task) => !disabledStatuses.has(task.status)),
    [disabledStatuses, tasks],
  );
  const { byDate, undated } = useMemo(
    () => bucketTasksByDue(filteredTasks),
    [filteredTasks],
  );
  const cells = useMemo(
    () =>
      range === "month"
        ? buildMonthCells(visibleMonth)
        : buildWeekCells(weekAnchor),
    [range, visibleMonth, weekAnchor],
  );
  const todayTasks = byDate.get(today) ?? [];
  const upcoming = useMemo(
    () =>
      filteredTasks
        .filter((task) => {
          const due = Due.parse(task.due);
          if (due === undefined) {
            return false;
          }
          const delta = daysBetween(today, due);
          return delta < 0
            ? task.status !== doneColumn
            : delta > 0 && delta <= UPCOMING_DAYS;
        })
        .sort((left, right) => (left.due ?? "").localeCompare(right.due ?? "")),
    [filteredTasks, today, doneColumn],
  );

  const monthKey = [visibleMonth.year, pad2(visibleMonth.month)].join("-");
  const rangeLabel =
    range === "month"
      ? `${visibleMonth.year}年 ${visibleMonth.month}月`
      : cells[0]?.date.split("-").join("/") +
        " – " +
        cells[cells.length - 1]?.date.split("-").join("/");

  /** task選択時にcompact detailを開き、既存callbackも呼ぶ。 */
  const selectTask = (task: Task) => {
    setSelectedTask(task);
    onTaskClick?.(task.id);
  };

  /** status filterの有効状態を反転する。 */
  const toggleStatus = (status: string) => {
    setDisabledStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  /** 前の表示範囲へ移動する。 */
  const showPrevious = () => {
    if (range === "month") {
      setVisibleMonth((current) => addMonth(current, -1));
      return;
    }
    const next = addDays(weekAnchor, -DAYS_PER_WEEK);
    setWeekAnchor(next);
    setVisibleMonth(yearMonthOf(next));
  };

  /** 次の表示範囲へ移動する。 */
  const showNext = () => {
    if (range === "month") {
      setVisibleMonth((current) => addMonth(current, 1));
      return;
    }
    const next = addDays(weekAnchor, DAYS_PER_WEEK);
    setWeekAnchor(next);
    setVisibleMonth(yearMonthOf(next));
  };

  /** 今日を含む表示範囲へ戻す。 */
  const showToday = () => {
    setVisibleMonth(yearMonthOf(today));
    setWeekAnchor(today);
  };

  /** 月/週表示を切り替える。 */
  const switchRange = (nextRange: CalendarRange) => {
    if (nextRange === "week" && range !== "week") {
      const todayMonth = yearMonthOf(today);
      const isCurrentMonth =
        todayMonth.year === visibleMonth.year &&
        todayMonth.month === visibleMonth.month;
      setWeekAnchor(
        isCurrentMonth
          ? today
          : [visibleMonth.year, pad2(visibleMonth.month), "01"].join("-"),
      );
    }
    setRange(nextRange);
  };

  return (
    <section
      aria-label="タスクカレンダー"
      className="flex h-full min-h-[36rem] min-w-0 flex-col overflow-hidden bg-bg text-foreground"
    >
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
        <button
          type="button"
          onClick={showToday}
          aria-label="今日を表示"
          className="h-7 rounded-md border border-border bg-panel-2 px-2.5 text-xs font-medium hover:bg-bg"
        >
          今日
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={showPrevious}
            aria-label={range === "month" ? "前の月" : "前の週"}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-panel-2 hover:bg-bg"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5 fill-none stroke-current stroke-[1.75]"
            >
              <path
                d="m15 6-6 6 6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={showNext}
            aria-label={range === "month" ? "次の月" : "次の週"}
            className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-panel-2 hover:bg-bg"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5 fill-none stroke-current stroke-[1.75]"
            >
              <path
                d="m9 6 6 6-6 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <h2 className="min-w-36 text-sm font-semibold">{rangeLabel}</h2>
        <div className="ml-auto flex rounded-md border border-border bg-bg p-0.5">
          {(["month", "week"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-range={value}
              aria-pressed={range === value}
              onClick={() => switchRange(value)}
              className={
                range === value
                  ? "rounded bg-panel px-2.5 py-1 text-xs font-medium shadow-sm"
                  : "rounded px-2.5 py-1 text-xs text-muted"
              }
            >
              {value === "month" ? "月" : "週"}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={filtersVisible}
          onClick={() => setFiltersVisible((current) => !current)}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-2.5 text-xs font-medium hover:bg-bg"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-3.5 fill-none stroke-current stroke-[1.75]"
          >
            <path d="M3 6h18M6 12h12M10 18h4" strokeLinecap="round" />
          </svg>
          フィルタ
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
        <div className="flex min-w-0 flex-col overflow-hidden bg-bg p-3 pb-4 pl-4">
          <div className="grid grid-cols-7 rounded-t-lg border border-b-0 border-border bg-panel">
            {WEEKDAY_LABELS.map((label, index) => {
              const weekday =
                index === 0 ? "sun" : index === 6 ? "sat" : "weekday";
              const color =
                index === 0
                  ? "text-red-600"
                  : index === 6
                    ? "text-blue-600"
                    : "text-muted";
              return (
                <div
                  key={label}
                  data-weekday={weekday}
                  className={[
                    "border-r border-border px-3 py-2 text-[11px] font-semibold last:border-r-0",
                    color,
                  ].join(" ")}
                >
                  {label}
                </div>
              );
            })}
          </div>
          <div
            className={[
              "grid min-h-0 flex-1 grid-cols-7 overflow-hidden rounded-b-lg border border-border bg-panel",
              range === "month" ? "grid-rows-6" : "grid-rows-1",
            ].join(" ")}
          >
            {cells.map((cell) => {
              const dayTasks = byDate.get(cell.date) ?? [];
              const visibleTasks = dayTasks.slice(0, MAX_VISIBLE_EVENTS);
              const more = dayTasks.length - visibleTasks.length;
              const outside = cell.date.slice(0, 7) !== monthKey;
              const isToday = cell.date === today;
              const weekend =
                cell.weekday === 0
                  ? "text-red-600"
                  : cell.weekday === 6
                    ? "text-blue-600"
                    : "text-foreground";
              return (
                <article
                  key={cell.date}
                  data-calendar-date={cell.date}
                  data-today={isToday ? "true" : undefined}
                  data-outside={outside ? "true" : undefined}
                  className={[
                    "group relative min-h-0 overflow-hidden border-r border-b border-border p-1.5 transition-colors [&:nth-child(7n)]:border-r-0",
                    outside ? "bg-panel-2" : "bg-panel hover:bg-panel-2",
                  ].join(" ")}
                >
                  <div className="mb-1 flex items-center gap-1">
                    <span
                      className={
                        isToday
                          ? "inline-flex size-[22px] items-center justify-center rounded-full bg-accent font-mono text-[11px] font-medium text-accent-foreground ring-2 ring-panel"
                          : [
                              "inline-flex size-[22px] items-center justify-center font-mono text-[11px] font-medium",
                              outside ? "text-text-dim" : weekend,
                            ].join(" ")
                      }
                    >
                      {cell.day}
                    </span>
                    {cell.day === 1 && (
                      <span className="ml-auto font-mono text-[9px] text-text-dim">
                        {cell.month}月
                      </span>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`${cell.date}にタスクを追加`}
                      onClick={() => onAddTask?.(cell.date)}
                      className="ml-auto inline-flex size-[18px] items-center justify-center rounded-full text-text-dim opacity-0 hover:bg-bg hover:text-accent group-hover:opacity-100"
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="size-3 fill-none stroke-current stroke-2"
                      >
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                    {visibleTasks.map((task) => {
                      const overdue =
                        task.status !== doneColumn &&
                        Due.isOverdue(task.due, today);
                      const milestone =
                        task.milestone === undefined
                          ? "border-l-2"
                          : "border-l-0 bg-accent-soft font-medium";
                      const eventState = overdue
                        ? "border-l-red-600 bg-red-500/10"
                        : statusEventClass(task.status);
                      const done =
                        task.status === doneColumn
                          ? "line-through opacity-60"
                          : "";
                      return (
                        <button
                          key={task.id}
                          type="button"
                          data-task-id={task.id}
                          data-status={task.status}
                          data-overdue={overdue}
                          onClick={() => selectTask(task)}
                          title={task.title}
                          className={[
                            "flex w-full items-center gap-1 overflow-hidden rounded-[3px] px-1 py-0.5 text-left text-[10.5px] leading-tight hover:brightness-95",
                            milestone,
                            eventState,
                            done,
                          ].join(" ")}
                        >
                          {task.priority !== undefined && (
                            <span
                              aria-hidden="true"
                              data-priority={task.priority}
                              className={[
                                "size-1.5 shrink-0 rounded-full",
                                priorityDotClass(task.priority),
                              ].join(" ")}
                            />
                          )}
                          <span className="truncate">{task.title}</span>
                        </button>
                      );
                    })}
                    {more > 0 && (
                      <span className="px-1 text-[10px] text-muted">
                        + あと {more} 件
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside
          data-testid="calendar-sidebar"
          className="flex w-80 min-h-0 flex-col overflow-y-auto border-l border-border bg-panel"
        >
          <section className="border-b border-border px-4 py-3.5">
            <h3 className="mb-2 flex items-center text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
              今日
              <span className="ml-auto font-mono text-[10px] font-medium normal-case tracking-normal text-text-dim">
                {today}
              </span>
            </h3>
            {todayTasks.length === 0 ? (
              <p className="px-1 py-2 text-xs text-text-dim">
                予定はありません
              </p>
            ) : (
              todayTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => selectTask(task)}
                  className="grid w-full grid-cols-[36px_1fr] gap-2.5 border-t border-border py-2 text-left first:border-t-0"
                >
                  <span className="rounded-md border border-accent bg-accent py-1 text-center text-accent-foreground">
                    <span className="block text-[9px] font-semibold uppercase">
                      今日
                    </span>
                    <span className="block font-mono text-sm font-semibold leading-none">
                      {Number(today.slice(8, 10))}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight">
                      {task.title}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-text-dim">
                      <span
                        className={[
                          "size-1.5 rounded-full",
                          statusDotClass(task.status),
                        ].join(" ")}
                      />
                      {task.status} · {taskFileName(task)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </section>

          <section className="border-b border-border px-4 py-3.5">
            <h3 className="mb-2 flex items-center text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
              今後の予定
              <span className="ml-auto font-mono text-[10px] text-text-dim">
                {upcoming.length}
              </span>
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-1 py-2 text-xs text-text-dim">
                21日以内の予定はありません
              </p>
            ) : (
              upcoming.map((task) => {
                const due = Due.parse(task.due);
                if (due === undefined) {
                  return null;
                }
                const delta = daysBetween(today, due);
                const overdue = delta < 0;
                const date = fromDateString(due);
                return (
                  <button
                    key={task.id}
                    type="button"
                    data-sidebar-task={task.id}
                    onClick={() => selectTask(task)}
                    className="grid w-full grid-cols-[36px_1fr] gap-2.5 border-t border-border py-2 text-left first:border-t-0"
                  >
                    <span
                      className={[
                        "rounded-md border py-1 text-center",
                        overdue
                          ? "border-red-300 bg-red-500/10 text-red-600"
                          : "border-border bg-panel-2",
                      ].join(" ")}
                    >
                      <span className="block text-[9px] font-semibold">
                        {MONTH_NAMES[date.getMonth()]}
                      </span>
                      <span className="block font-mono text-sm font-semibold leading-none">
                        {date.getDate()}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium leading-tight">
                        {task.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-[10px] text-text-dim">
                        <span
                          className={[
                            "size-1.5 rounded-full",
                            statusDotClass(task.status),
                          ].join(" ")}
                        />
                        {overdue
                          ? `${Math.abs(delta)}日 遅延`
                          : `あと ${delta} 日`}{" "}
                        · {task.status}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </section>

          {filtersVisible && (
            <section className="border-b border-border px-4 py-3.5">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                ステータス
              </h3>
              <div className="flex flex-col gap-1">
                {statuses.map((status) => (
                  <label
                    key={status}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-panel-2"
                  >
                    <input
                      type="checkbox"
                      value={status}
                      checked={!disabledStatuses.has(status)}
                      onChange={() => toggleStatus(status)}
                      className="size-3.5 accent-accent"
                    />
                    <span
                      className={[
                        "size-2.5 rounded-[3px]",
                        statusDotClass(status),
                      ].join(" ")}
                    />
                    <span className="flex-1 text-xs">{status}</span>
                    <span className="font-mono text-[10px] text-text-dim">
                      {tasks.filter((task) => task.status === status).length}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {undated.length > 0 && (
            <section
              data-testid="calendar-undated"
              className="border-b border-border px-4 py-3.5"
            >
              <h3 className="mb-2 flex text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
                期限なし
                <span className="ml-auto font-mono text-[10px] text-text-dim">
                  {undated.length}
                </span>
              </h3>
              <div className="flex flex-col gap-1">
                {undated.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => selectTask(task)}
                    className="truncate rounded border border-border px-2 py-1 text-left text-xs hover:bg-panel-2"
                  >
                    {task.title}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="px-4 py-3.5">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
              凡例
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-muted">
                <span className="size-1.5 rounded-full bg-red-600" />
                期限超過
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-muted">
                <span className="size-1.5 rounded-full bg-amber-500" />
                期限当日
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-muted">
                <span className="size-1.5 rounded-full bg-green-600" />
                完了
              </span>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-text-dim">
              <code className="font-mono">due: YYYY-MM-DD</code>
              <br />
              をフロントマターに記述すると、カレンダーに表示されます。
            </p>
          </section>
        </aside>
      </div>

      {selectedTask !== null && (
        <>
          <button
            type="button"
            aria-label="詳細背景を閉じる"
            onClick={() => setSelectedTask(null)}
            className="fixed inset-0 z-20 cursor-default bg-black/35"
          />
          <aside
            data-testid="calendar-detail"
            aria-label="タスク詳細"
            className="fixed inset-y-0 right-0 z-30 flex w-[480px] max-w-[92vw] flex-col border-l border-border bg-panel shadow-2xl"
          >
            <header className="flex items-center gap-2 border-b border-border px-4 py-3.5">
              <span className="rounded border border-border bg-bg px-2 py-0.5 font-mono text-[11px] text-text-dim">
                {taskFileName(selectedTask)}
              </span>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                aria-label="詳細を閉じる"
                className="ml-auto inline-flex size-7 items-center justify-center rounded-md border border-border bg-panel-2 hover:bg-bg"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-3.5 fill-none stroke-current stroke-[1.75]"
                >
                  <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <h3 className="mb-5 text-xl font-semibold leading-snug">
                {selectedTask.title}
              </h3>
              <dl className="grid grid-cols-[96px_1fr] gap-x-4 gap-y-3 border-y border-border py-4 text-xs">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  ステータス
                </dt>
                <dd className="flex items-center gap-2">
                  <span
                    className={[
                      "size-2 rounded-full",
                      statusDotClass(selectedTask.status),
                    ].join(" ")}
                  />
                  {selectedTask.status}
                </dd>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  優先度
                </dt>
                <dd>{selectedTask.priority ?? "—"}</dd>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  期限
                </dt>
                <dd
                  className={
                    Due.isOverdue(selectedTask.due, today) &&
                    selectedTask.status !== doneColumn
                      ? "font-medium text-red-600"
                      : ""
                  }
                >
                  {selectedTask.due ?? "—"}
                </dd>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  ラベル
                </dt>
                <dd className="flex flex-wrap gap-1">
                  {selectedTask.labels.length === 0
                    ? "—"
                    : selectedTask.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-border bg-bg px-2 py-0.5 text-[10px]"
                        >
                          {label}
                        </span>
                      ))}
                </dd>
              </dl>
              <div className="mt-4 rounded-md border border-border bg-bg px-3 py-2 font-mono text-[11px] text-muted">
                {selectedTask.filePath}
              </div>
            </div>
          </aside>
        </>
      )}
    </section>
  );
};
