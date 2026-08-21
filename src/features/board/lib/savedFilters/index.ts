import { Priority } from "@/domains/priority";
import {
  EMPTY_TASK_FILTER,
  type TaskFilterCriteria,
} from "@/features/board/lib/applyTaskFilter";

/** 保存済みフィルタ 1 件分。`name` が同一プロジェクト内の識別子（同名保存は上書き）。 */
export type SavedFilter = {
  /** 表示名（識別子を兼ねる） */
  name: string;
  /** 保存された絞り込み条件 */
  criteria: TaskFilterCriteria;
};

/** 保存済みフィルタを保存する localStorage キー（プロジェクトパス別の map）。 */
export const SAVED_FILTERS_STORAGE_KEY = "spec-board:saved-filters";

/** 1 プロジェクトあたりの保存上限。 */
export const SAVED_FILTERS_LIMIT = 20;

/**
 * 未知の入力から文字列配列だけを取り出す。
 * @param value - 任意の入力
 * @returns 文字列要素のみの配列
 */
const stringArrayOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/**
 * 未知の入力を {@link TaskFilterCriteria.milestone} に正規化する。
 *
 * `kind` が許容 union（all / unassigned / milestone + string name）に一致する場合のみ
 * 採用し、それ以外（未知 kind / name 型不正 / 非オブジェクト）は「全件」へ倒す。
 * `matchesMilestone` は all / unassigned 以外をすべて「指定マイルストーン」として
 * 扱うため、未知 kind をそのまま通すと全件が除外される隠れフィルタになる。
 * @param value - 永続化から復元した任意の値
 * @returns 正規化済みの milestone フィルタ
 */
const normalizeMilestoneFilter = (
  value: unknown,
): TaskFilterCriteria["milestone"] => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_TASK_FILTER.milestone;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === "all" || record.kind === "unassigned") {
    return { kind: record.kind };
  }
  if (record.kind === "milestone" && typeof record.name === "string") {
    return { kind: "milestone", name: record.name };
  }
  return EMPTY_TASK_FILTER.milestone;
};

/**
 * 未知の入力を TaskFilterCriteria に正規化する。
 * 欠損・型不一致のフィールドは既定値（絞り込みなし）に落とす。
 * @param value - 永続化から復元した任意の値
 * @returns 正規化済みの criteria
 */
const normalizeCriteria = (value: unknown): TaskFilterCriteria => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_TASK_FILTER;
  }
  const record = value as Record<string, unknown>;
  return {
    keyword:
      typeof record.keyword === "string"
        ? record.keyword
        : EMPTY_TASK_FILTER.keyword,
    labels: stringArrayOf(record.labels),
    priorities: stringArrayOf(record.priorities).flatMap((raw) => {
      const parsed = Priority.parse(raw);
      return parsed === undefined ? [] : [parsed];
    }),
    statuses: stringArrayOf(record.statuses),
    milestone: normalizeMilestoneFilter(record.milestone),
  };
};

/**
 * 未知の入力を SavedFilter 配列に正規化する。
 * name が文字列でない・trim 後に空のエントリは捨て、trim 済み name で
 * 先勝ち重複排除する（保存側も trim 済み name を使うため、前後空白付きの
 * 値が混入しても「見た目が同じ別エントリ」や上書き不能が起きない）。
 * @param value - 永続化から復元した任意の値
 * @returns 正規化済みの保存済みフィルタ一覧
 */
export const normalizeSavedFilters = (value: unknown): SavedFilter[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const filters: SavedFilter[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") {
      continue;
    }
    const name = record.name.trim();
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    filters.push({
      name,
      criteria: normalizeCriteria(record.criteria),
    });
  }
  return filters.slice(0, SAVED_FILTERS_LIMIT);
};

/**
 * localStorage の生値からプロジェクト別 map を復元する。壊れた値は空 map。
 * @returns プロジェクトパス → 保存済みフィルタ一覧の map
 */
const readStore = (): Record<string, unknown> => {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SAVED_FILTERS_STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw === null) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
};

/**
 * プロジェクト別 map を localStorage へ書き戻す。書き込み失敗は無視する
 * （保存済みフィルタは利便機能であり、失敗してもボード操作を妨げない）。
 * @param store - プロジェクトパス → 一覧の map
 */
const writeStore = (store: Record<string, unknown>): void => {
  try {
    window.localStorage.setItem(
      SAVED_FILTERS_STORAGE_KEY,
      JSON.stringify(store),
    );
  } catch {
    // 書き込み失敗（容量超過・プライベートモード等）は黙って諦める。
  }
};

/**
 * 指定プロジェクトの保存済みフィルタ一覧を読み込む。
 * @param projectPath - プロジェクトの絶対パス（storage キー）
 * @returns 保存済みフィルタ一覧（未保存・壊れた値は空配列）
 */
export const loadSavedFilters = (projectPath: string): SavedFilter[] =>
  normalizeSavedFilters(readStore()[projectPath]);

/**
 * 保存済みフィルタを追加または同名上書きし、更新後の一覧を返す。
 * 上限超過時は追加せず現在の一覧を返す（同名上書きは常に可）。
 * @param projectPath - プロジェクトの絶対パス
 * @param filter - 保存するフィルタ（name は trim 済みを渡す）
 * @returns 更新後の一覧
 */
export const persistSavedFilter = (
  projectPath: string,
  filter: SavedFilter,
): SavedFilter[] => {
  const current = loadSavedFilters(projectPath);
  const withoutSameName = current.filter(
    (existing) => existing.name !== filter.name,
  );
  if (
    withoutSameName.length === current.length &&
    current.length >= SAVED_FILTERS_LIMIT
  ) {
    return current;
  }
  const next = [...withoutSameName, filter];
  const store = readStore();
  store[projectPath] = next;
  writeStore(store);
  return next;
};

/**
 * 保存済みフィルタを削除し、更新後の一覧を返す。
 * @param projectPath - プロジェクトの絶対パス
 * @param name - 削除対象の名前
 * @returns 更新後の一覧
 */
export const removeSavedFilter = (
  projectPath: string,
  name: string,
): SavedFilter[] => {
  const next = loadSavedFilters(projectPath).filter(
    (existing) => existing.name !== name,
  );
  const store = readStore();
  store[projectPath] = next;
  writeStore(store);
  return next;
};
