import { useMemo, useState } from "react";
import { Due } from "@/domains/due";
import type { Task } from "@/domains/task";
import {
  addMonth,
  bucketTasksByDue,
  buildMonthGrid,
  type YearMonth,
} from "../../lib/calendarMonth";

/** 曜日見出し（日曜始まり）。 */
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** CalendarView の Props。 */
type CalendarViewProps = {
  /** 表示するタスク一覧（絞り込み済み） */
  tasks: Task[];
  /**
   * 日付セル内のタスククリック時のコールバック。
   * @param taskId - クリックされたタスクの ID
   */
  onTaskClick?: (taskId: string) => void;
};

/**
 * クライアントのローカル年月を返す。
 * @returns 今日が属する年月
 */
const currentYearMonth = (): YearMonth => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

/**
 * 期限日でタスクを配置する月間カレンダービュー。前後の月へ移動でき、
 * 期限なし / 不正な期限のタスクは下部にまとめて表示する。
 * @param props - {@link CalendarViewProps}
 * @returns カレンダービュー要素
 */
export const CalendarView = ({ tasks, onTaskClick }: CalendarViewProps) => {
  const [visibleMonth, setVisibleMonth] = useState<YearMonth>(currentYearMonth);
  // 「今日」ハイライトが深夜 0 時跨ぎでも当日に追従するよう、軽量なので都度計算する。
  const today = Due.todayLocal();

  const weeks = useMemo(
    () => buildMonthGrid(visibleMonth.year, visibleMonth.month),
    [visibleMonth],
  );
  const { byDate, undated } = useMemo(() => bucketTasksByDue(tasks), [tasks]);

  // 描画前にセルへ安定 key を付与する（月外の空セルは date を持たないため連番 key を割る）。
  const cells = useMemo(() => {
    const result: { key: string; date: string | null }[] = [];
    let emptyCount = 0;
    for (const cell of weeks.flat()) {
      if (cell === null) {
        result.push({ key: `empty-${emptyCount}`, date: null });
        emptyCount += 1;
      } else {
        result.push({ key: cell, date: cell });
      }
    }
    return result;
  }, [weeks]);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setVisibleMonth((prev) => addMonth(prev, -1))}
          aria-label="前の月"
          className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-muted"
        >
          ‹
        </button>
        <h2 className="text-sm font-semibold text-foreground">
          {visibleMonth.year}年{visibleMonth.month}月
        </h2>
        <button
          type="button"
          onClick={() => setVisibleMonth((prev) => addMonth(prev, 1))}
          aria-label="次の月"
          className="rounded px-2 py-1 text-sm text-muted hover:bg-surface-muted"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-border bg-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="bg-surface-muted py-1 text-center text-xs text-muted"
          >
            {label}
          </div>
        ))}
        {cells.map(({ key, date }) => {
          if (date === null) {
            return <div key={key} className="min-h-20 bg-surface-muted" />;
          }
          const dayTasks = byDate.get(date) ?? [];
          const dayNumber = Number(date.slice(8, 10));
          const isToday = date === today;
          return (
            <div key={key} className="min-h-20 bg-surface p-1">
              <div
                className={
                  isToday
                    ? "mb-1 inline-flex size-5 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground"
                    : "mb-1 text-xs text-muted"
                }
              >
                {dayNumber}
              </div>
              <ul className="flex flex-col gap-0.5">
                {dayTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => onTaskClick?.(task.id)}
                      className="w-full truncate rounded bg-accent-soft px-1 py-0.5 text-left text-xs text-foreground hover:brightness-95"
                    >
                      {task.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-muted">期限なし</h3>
          <ul className="flex flex-wrap gap-1">
            {undated.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onTaskClick?.(task.id)}
                  className="rounded border border-border px-2 py-0.5 text-xs text-foreground hover:bg-surface-muted"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
