import { type CSSProperties, useMemo, useState } from "react";
import { ColumnColor } from "@/domains/column-color";
import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

type RoadmapZoom = "day" | "week";

/** RoadmapView の Props。 */
export type RoadmapViewProps = {
  /** 表示対象のタスク。親を持たないタスクを Epic として扱う。 */
  tasks: Task[];
  /** status の順序と色。 */
  columns?: readonly Column[];
  /** 進捗計算で完了扱いする status。 */
  doneColumn?: string;
  /** 今日の日付。Story・テストで表示を固定するため上書き可能。 */
  today?: string;
  /** 初期展開状態。 */
  defaultExpanded?: boolean;
  /** Epic 追加操作。 */
  onAddEpic?: () => void;
  /** タスク選択操作。 */
  onTaskClick?: (taskId: string) => void;
};

type DatedTask = {
  task: Task;
  start: Date;
  end: Date;
};

type RoadmapEpic = DatedTask & {
  children: DatedTask[];
  done: number;
};

type RoadmapDay = {
  date: Date;
  key: string;
  label: string;
  weekend: boolean;
};

const DAY_MS = 86_400_000;
const DAY_WIDTH = 28;
const WEEK_WIDTH = 16;
const DEFAULT_RANGE_DAYS = 27;

/** YYYY-MM-DD を UTC 日付へ変換する。不正値は undefined。 */
const parseDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** Date を YYYY-MM-DD にする。 */
const dateKey = (date: Date): string => date.toISOString().slice(0, 10);

/** 指定日数を加えた新しい Date を返す。 */
const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * DAY_MS);

/** タスクの開始日と終了日を frontmatter 互換フィールドから解決する。 */
const resolveDates = (task: Task, fallback: Date): DatedTask => {
  const extraStart = parseDate(task.extras.start);
  const extraEnd = parseDate(task.extras.end);
  const due = parseDate(task.due);
  const start = extraStart ?? due ?? fallback;
  const rawEnd = extraEnd ?? due ?? start;
  return {
    task,
    start: rawEnd < start ? rawEnd : start,
    end: rawEnd < start ? start : rawEnd,
  };
};

/** Roadmap の Epic と直下の child を構築する。 */
const buildEpics = (
  tasks: Task[],
  fallback: Date,
  doneColumn: string,
): RoadmapEpic[] => {
  const byPath = new Map(tasks.map((task) => [task.filePath, task]));
  const roots = tasks.filter((task) => {
    const parent = task.hierarchy.parentFilePath;
    return parent === undefined || !byPath.has(parent);
  });
  return roots.map((task) => {
    const childPaths = new Set(task.hierarchy.childFilePaths);
    const children = tasks
      .filter(
        (candidate) =>
          candidate.hierarchy.parentFilePath === task.filePath ||
          childPaths.has(candidate.filePath),
      )
      .map((child) => resolveDates(child, fallback));
    const dated = resolveDates(task, fallback);
    const starts = [dated.start, ...children.map((child) => child.start)];
    const ends = [dated.end, ...children.map((child) => child.end)];
    return {
      ...dated,
      start: new Date(Math.min(...starts.map((date) => date.getTime()))),
      end: new Date(Math.max(...ends.map((date) => date.getTime()))),
      children,
      done: children.filter((child) => child.task.status === doneColumn).length,
    };
  });
};

/** 日付範囲をヘッダー描画用の配列にする。 */
const buildDays = (start: Date, end: Date): RoadmapDay[] => {
  const length = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1,
  );
  return Array.from({ length }, (_, index) => {
    const date = addDays(start, index);
    const day = date.getUTCDay();
    return {
      date,
      key: dateKey(date),
      label: String(date.getUTCDate()),
      weekend: day === 0 || day === 6,
    };
  });
};

/** 月ごとの連続区間にまとめる。 */
const buildMonths = (days: RoadmapDay[]) => {
  const months: { key: string; label: string; length: number }[] = [];
  for (const day of days) {
    const key = `${day.date.getUTCFullYear()}-${day.date.getUTCMonth()}`;
    const current = months[months.length - 1];
    if (current?.key === key) {
      current.length += 1;
      continue;
    }
    months.push({
      key,
      label: `${day.date.getUTCFullYear()}年 ${day.date.getUTCMonth() + 1}月`,
      length: 1,
    });
  }
  return months;
};

/** UI 用の短い期間表記。 */
const formatRange = (start: Date, end: Date): string =>
  `${start.getUTCMonth() + 1}/${start.getUTCDate()} – ${end.getUTCMonth() + 1}/${end.getUTCDate()}`;

type TimelineBarProps = {
  item: DatedTask;
  rangeStart: Date;
  accent: string;
  onTaskClick?: (taskId: string) => void;
};

/** task の期間バー。 */
const TimelineBar = ({
  item,
  rangeStart,
  accent,
  onTaskClick,
}: TimelineBarProps) => {
  const offset = Math.round(
    (item.start.getTime() - rangeStart.getTime()) / DAY_MS,
  );
  const duration = Math.max(
    1,
    Math.round((item.end.getTime() - item.start.getTime()) / DAY_MS) + 1,
  );
  return (
    <button
      type="button"
      data-roadmap-bar
      title={`${item.task.title}: ${formatRange(item.start, item.end)}`}
      onClick={() => onTaskClick?.(item.task.id)}
      className="absolute top-1/2 h-5 -translate-y-1/2 truncate rounded px-2 text-left text-[11px] font-medium text-white shadow-sm transition hover:-translate-y-[55%] hover:shadow-md"
      style={{
        left: `calc(${offset} * var(--roadmap-day-width))`,
        width: `calc(${duration} * var(--roadmap-day-width) - 3px)`,
        backgroundColor: accent,
      }}
    >
      {item.task.title}
    </button>
  );
};

type TimelineGridProps = {
  days: RoadmapDay[];
  todayKey: string;
  children?: React.ReactNode;
};

/** weekend・today・日次罫線を共有する timeline cell。 */
const TimelineGrid = ({ days, todayKey, children }: TimelineGridProps) => (
  <div
    className="relative border-b border-border"
    style={{
      width: `calc(${days.length} * var(--roadmap-day-width))`,
      minHeight: "var(--roadmap-row-height)",
      backgroundImage:
        "repeating-linear-gradient(to right, transparent 0, transparent calc(var(--roadmap-day-width) - 1px), var(--color-border) calc(var(--roadmap-day-width) - 1px), var(--color-border) var(--roadmap-day-width))",
    }}
  >
    {days.map((day, index) => (
      <span
        key={day.key}
        data-roadmap-weekend={day.weekend ? "" : undefined}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 ${day.weekend ? "bg-surface-muted/75" : ""}`}
        style={{
          left: `calc(${index} * var(--roadmap-day-width))`,
          width: "var(--roadmap-day-width)",
        }}
      />
    ))}
    {days.map((day, index) =>
      day.key === todayKey ? (
        <span
          key={`today-${day.key}`}
          data-roadmap-today
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-[1] border-l-2 border-accent bg-accent/10"
          style={{
            left: `calc(${index} * var(--roadmap-day-width))`,
            width: "var(--roadmap-day-width)",
          }}
        />
      ) : null,
    )}
    <div className="relative z-[2]">{children}</div>
  </div>
);

/** Epic 単位でタスク期間を俯瞰するロードマップ。 */
export const RoadmapView = ({
  tasks,
  columns = [],
  doneColumn = "Done",
  today = dateKey(new Date()),
  defaultExpanded = true,
  onAddEpic,
  onTaskClick,
}: RoadmapViewProps) => {
  const fallback = parseDate(today) ?? new Date();
  const epics = useMemo(
    () => buildEpics(tasks, fallback, doneColumn),
    [tasks, fallback, doneColumn],
  );
  const [zoom, setZoom] = useState<RoadmapZoom>("day");
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(defaultExpanded ? epics.map((epic) => epic.task.id) : []),
  );

  const rangeStart =
    epics.length === 0
      ? addDays(fallback, -7)
      : new Date(
          Math.min(
            ...epics.map((epic) => epic.start.getTime()),
            fallback.getTime(),
          ),
        );
  const contentEnd =
    epics.length === 0
      ? addDays(rangeStart, DEFAULT_RANGE_DAYS)
      : new Date(
          Math.max(
            ...epics.map((epic) => epic.end.getTime()),
            addDays(rangeStart, DEFAULT_RANGE_DAYS).getTime(),
          ),
        );
  const days = buildDays(rangeStart, contentEnd);
  const months = buildMonths(days);
  const statusAccent = new Map(
    columns.map((column, index) => [
      column.name,
      ColumnColor.resolveAccent(column.color, index),
    ]),
  );
  const fallbackAccent = "var(--color-accent)";
  const roadmapStyle = {
    "--roadmap-left-width": "280px",
    "--roadmap-day-width": `${zoom === "day" ? DAY_WIDTH : WEEK_WIDTH}px`,
    "--roadmap-row-height": "36px",
  } as CSSProperties;

  const toggleEpic = (taskId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  return (
    <div
      data-roadmap
      style={roadmapStyle}
      className="flex h-full min-h-0 w-full flex-col bg-surface"
    >
      <header
        data-roadmap-controlbar
        className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-0"
      >
        <fieldset
          aria-label="ロードマップ表示単位"
          className="flex rounded-md border border-border p-0.5"
        >
          {(["day", "week"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              aria-pressed={zoom === unit}
              onClick={() => setZoom(unit)}
              className={`rounded px-3 py-1 text-xs ${zoom === unit ? "bg-accent text-white" : "text-muted hover:bg-surface-muted"}`}
            >
              {unit === "day" ? "日" : "週"}
            </button>
          ))}
        </fieldset>
        <span className="rounded border border-border bg-surface-muted px-2 py-1 text-xs text-muted">
          グループ: Epic
        </span>
        <button
          type="button"
          onClick={onAddEpic}
          disabled={onAddEpic === undefined}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          ＋ Epicを追加
        </button>
      </header>

      <div
        data-roadmap-legendbar
        className="flex h-9 shrink-0 items-center border-b border-border bg-surface px-4"
      >
        <div className="ml-auto flex items-center gap-4">
          {columns.map((column, index) => (
            <span
              key={column.name}
              data-roadmap-legend
              className="flex items-center gap-1 text-xs text-muted"
            >
              <span
                className="size-2 rounded-full"
                style={{
                  backgroundColor: ColumnColor.resolveAccent(
                    column.color,
                    index,
                  ),
                }}
              />
              {column.name}
            </span>
          ))}
        </div>
      </div>
      <div data-roadmap-scroll className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max">
          <div className="sticky top-0 z-20 grid grid-cols-[var(--roadmap-left-width)_auto] bg-surface shadow-sm">
            <div
              data-roadmap-left-header
              className="sticky left-0 z-30 flex h-16 items-end border-r border-b border-border bg-surface px-3 pb-2 text-xs font-semibold text-muted"
            >
              Epic / タスク
            </div>
            <div
              style={{
                width: `calc(${days.length} * var(--roadmap-day-width))`,
              }}
            >
              <div
                data-roadmap-month-header
                className="flex h-8 border-b border-border bg-surface-muted"
              >
                {months.map((month) => (
                  <span
                    key={month.key}
                    className="border-r border-border px-2 py-1 text-xs font-semibold text-foreground"
                    style={{
                      width: `calc(${month.length} * var(--roadmap-day-width))`,
                    }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>
              <div data-roadmap-day-header className="flex h-8 bg-surface">
                {days.map((day) => (
                  <span
                    key={day.key}
                    className={`relative flex shrink-0 items-center justify-center border-r border-border text-[10px] ${day.weekend ? "bg-surface-muted text-muted" : "text-foreground"}`}
                    style={{ width: "var(--roadmap-day-width)" }}
                  >
                    {day.label}
                    {day.key === today ? (
                      <span
                        data-roadmap-today
                        className="absolute -top-1 rounded bg-accent px-1 text-[8px] text-white"
                      >
                        今日
                      </span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {epics.length === 0 ? (
            <div className="grid grid-cols-[var(--roadmap-left-width)_auto]">
              <div
                data-roadmap-empty
                className="sticky left-0 z-10 flex h-36 items-center justify-center border-r border-b border-border bg-surface px-4 text-sm text-muted"
              >
                Epicがありません
              </div>
              <TimelineGrid days={days} todayKey={today} />
            </div>
          ) : null}

          {epics.map((epic) => {
            const expanded = expandedIds.has(epic.task.id);
            const accent = statusAccent.get(epic.task.status) ?? fallbackAccent;
            const rows = expanded ? epic.children : [];
            return (
              <div key={epic.task.id} data-roadmap-epic>
                <div className="grid grid-cols-[var(--roadmap-left-width)_auto]">
                  <div
                    className="sticky left-0 z-10 flex h-[var(--roadmap-row-height)] items-center gap-2 border-r border-b border-border bg-surface px-3"
                    style={{ borderLeft: `3px solid ${accent}` }}
                  >
                    <button
                      type="button"
                      aria-label={`${epic.task.title}を${expanded ? "折りたたむ" : "展開する"}`}
                      onClick={() => toggleEpic(epic.task.id)}
                      className="size-5 rounded text-xs text-muted hover:bg-surface-muted"
                    >
                      {expanded ? "▾" : "▸"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onTaskClick?.(epic.task.id)}
                      className="min-w-0 flex-1 truncate text-left text-xs font-semibold text-foreground"
                    >
                      {epic.task.title}
                    </button>
                    <span className="font-mono text-[10px] text-muted">
                      {epic.done}/{epic.children.length}
                    </span>
                    <span className="text-[10px] text-muted">
                      {formatRange(epic.start, epic.end)}
                    </span>
                  </div>
                  <TimelineGrid days={days} todayKey={today}>
                    <TimelineBar
                      item={epic}
                      rangeStart={rangeStart}
                      accent={accent}
                      onTaskClick={onTaskClick}
                    />
                  </TimelineGrid>
                </div>
                {rows.map((child) => {
                  const childAccent =
                    statusAccent.get(child.task.status) ?? fallbackAccent;
                  return (
                    <div
                      key={child.task.id}
                      data-roadmap-child
                      className="grid grid-cols-[var(--roadmap-left-width)_auto]"
                    >
                      <div className="sticky left-0 z-10 flex h-[var(--roadmap-row-height)] items-center gap-2 border-r border-b border-border bg-surface pl-11 pr-3 before:absolute before:left-6 before:h-full before:border-l before:border-dashed before:border-border">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: childAccent }}
                        />
                        <button
                          type="button"
                          onClick={() => onTaskClick?.(child.task.id)}
                          className={`min-w-0 flex-1 truncate text-left text-xs ${child.task.status === doneColumn ? "text-muted line-through" : "text-foreground"}`}
                        >
                          {child.task.title}
                        </button>
                        <span className="text-[10px] text-muted">
                          {formatRange(child.start, child.end)}
                        </span>
                      </div>
                      <TimelineGrid days={days} todayKey={today}>
                        <TimelineBar
                          item={child}
                          rangeStart={rangeStart}
                          accent={childAccent}
                          onTaskClick={onTaskClick}
                        />
                      </TimelineGrid>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
