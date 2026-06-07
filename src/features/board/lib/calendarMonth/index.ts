import { Due } from "@/domains/due";
import type { Task } from "@/types/task";

/** 年月（month は 1-12）。 */
export type YearMonth = {
  /** 西暦年 */
  year: number;
  /** 月（1-12） */
  month: number;
};

/**
 * 数値を 2 桁ゼロ埋め文字列にする。
 * @param value - 対象の数値
 * @returns 2 桁ゼロ埋め文字列
 */
const pad2 = (value: number): string => String(value).padStart(2, "0");

/**
 * 年月日を `YYYY-MM-DD` 文字列にする。
 * @param year - 西暦年
 * @param month - 月（1-12）
 * @param day - 日
 * @returns `YYYY-MM-DD` 文字列
 */
const toDateString = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/**
 * 指定月のカレンダーグリッド（週 × 7 日）を組み立てる。
 * 月初の曜日までは先頭を null で詰め、末尾も 7 の倍数になるまで null で埋める。
 * @param year - 西暦年
 * @param month - 月（1-12）
 * @returns 週ごとの配列。各セルは `YYYY-MM-DD` か、月外を表す null
 */
export const buildMonthGrid = (
  year: number,
  month: number,
): (string | null)[][] => {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateString(year, month, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
};

/** タスクを期限日でまとめた結果。 */
export type TasksByDue = {
  /** 有効な期限日（`YYYY-MM-DD`）→ その日のタスク一覧 */
  byDate: Map<string, Task[]>;
  /** 期限なし / 不正な期限のタスク一覧 */
  undated: Task[];
};

/**
 * タスクを有効な期限日ごとにバケツ分けする。期限なし / 不正な期限は undated へ。
 * @param tasks - 振り分け対象のタスク一覧
 * @returns 期限日マップと期限なし一覧
 */
export const bucketTasksByDue = (tasks: Task[]): TasksByDue => {
  const byDate = new Map<string, Task[]>();
  const undated: Task[] = [];
  for (const task of tasks) {
    const parsed = Due.parse(task.due);
    if (parsed === undefined) {
      undated.push(task);
      continue;
    }
    const list = byDate.get(parsed) ?? [];
    list.push(task);
    byDate.set(parsed, list);
  }
  return { byDate, undated };
};

/**
 * 年月に月数を加減する（境界をまたぐと年を繰り上げ/繰り下げる）。
 * @param current - 基準の年月
 * @param delta - 加減する月数（負値可）
 * @returns 計算後の年月
 */
export const addMonth = (current: YearMonth, delta: number): YearMonth => {
  const zeroBased = current.month - 1 + delta;
  const year = current.year + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12;
  return { year, month: month + 1 };
};
