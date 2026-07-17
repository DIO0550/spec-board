import type { Priority } from "@/domains/priority";
import type { Task } from "@/domains/task";

/**
 * マイルストーンフィルタの選択状態。
 * 「未割当」を `string | null` では表現できないため判別可能 union にする。
 */
export type MilestoneFilter =
  | { kind: "all" }
  | { kind: "unassigned" }
  | { kind: "milestone"; name: string };

/** タスク絞り込みの条件一式。 */
export type TaskFilterCriteria = {
  /** タイトル / 本文へのキーワード部分一致（空文字は無条件一致） */
  keyword: string;
  /** いずれか 1 つでも含めば一致するラベル集合（空配列は無条件一致） */
  labels: string[];
  /** いずれかに一致すれば一致する優先度集合（空配列は無条件一致） */
  priorities: Priority[];
  /** いずれかに一致すれば一致するステータス集合（空配列は無条件一致） */
  statuses: string[];
  /** マイルストーン絞り込み */
  milestone: MilestoneFilter;
};

/** 何も絞り込まない既定の条件。 */
export const EMPTY_TASK_FILTER: TaskFilterCriteria = {
  keyword: "",
  labels: [],
  priorities: [],
  statuses: [],
  milestone: { kind: "all" },
};

/**
 * キーワード一致を判定する。空文字は無条件一致。大文字小文字は無視する。
 * @param task - 判定対象タスク
 * @param keyword - 検索キーワード
 * @returns 一致すれば true
 */
const matchesKeyword = (task: Task, keyword: string): boolean => {
  const trimmed = keyword.trim().toLowerCase();
  if (trimmed === "") {
    return true;
  }
  return (
    task.title.toLowerCase().includes(trimmed) ||
    task.body.toLowerCase().includes(trimmed)
  );
};

/**
 * ラベル一致を判定する。空集合は無条件一致。選択ラベルのいずれかを含めば一致。
 * @param task - 判定対象タスク
 * @param labels - 選択中のラベル集合
 * @returns 一致すれば true
 */
const matchesLabels = (task: Task, labels: string[]): boolean => {
  if (labels.length === 0) {
    return true;
  }
  return labels.some((label) => task.labels.includes(label));
};

/**
 * 優先度一致を判定する。空集合は無条件一致。未設定タスクは集合指定時に除外する。
 * @param task - 判定対象タスク
 * @param priorities - 選択中の優先度集合
 * @returns 一致すれば true
 */
const matchesPriorities = (task: Task, priorities: Priority[]): boolean => {
  if (priorities.length === 0) {
    return true;
  }
  if (task.priority === undefined) {
    return false;
  }
  return priorities.includes(task.priority);
};

/**
 * ステータス一致を判定する。空集合は無条件一致。
 * @param task - 判定対象タスク
 * @param statuses - 選択中のステータス集合
 * @returns 一致すれば true
 */
const matchesStatuses = (task: Task, statuses: string[]): boolean => {
  if (statuses.length === 0) {
    return true;
  }
  return statuses.includes(task.status);
};

/**
 * マイルストーン一致を判定する。
 * @param task - 判定対象タスク
 * @param milestone - マイルストーン絞り込み条件
 * @returns 一致すれば true
 */
const matchesMilestone = (task: Task, milestone: MilestoneFilter): boolean => {
  if (milestone.kind === "all") {
    return true;
  }
  if (milestone.kind === "unassigned") {
    return task.milestone === undefined || task.milestone === "";
  }
  return task.milestone === milestone.name;
};

/**
 * 全条件の AND で 1 件のタスクが条件に一致するかを判定する。
 * @param task - 判定対象タスク
 * @param criteria - 絞り込み条件
 * @returns すべての条件に一致すれば true
 */
export const matchesTaskFilter = (
  task: Task,
  criteria: TaskFilterCriteria,
): boolean => {
  return (
    matchesKeyword(task, criteria.keyword) &&
    matchesLabels(task, criteria.labels) &&
    matchesPriorities(task, criteria.priorities) &&
    matchesStatuses(task, criteria.statuses) &&
    matchesMilestone(task, criteria.milestone)
  );
};

/**
 * 条件に一致するタスクだけを抽出する（順序は保持）。
 * @param tasks - 絞り込み対象のタスク一覧
 * @param criteria - 絞り込み条件
 * @returns 一致したタスクの配列
 */
export const applyTaskFilter = (
  tasks: Task[],
  criteria: TaskFilterCriteria,
): Task[] => {
  return tasks.filter((task) => matchesTaskFilter(task, criteria));
};

/**
 * いずれかの条件で絞り込みが有効かを返す（クリアボタン表示などに使う）。
 * @param criteria - 絞り込み条件
 * @returns 1 つでも条件が設定されていれば true
 */
export const isTaskFilterActive = (criteria: TaskFilterCriteria): boolean => {
  return (
    criteria.keyword.trim() !== "" ||
    criteria.labels.length > 0 ||
    criteria.priorities.length > 0 ||
    criteria.statuses.length > 0 ||
    criteria.milestone.kind !== "all"
  );
};

/** 現在利用可能な絞り込み選択肢（間引きの基準）。 */
export type TaskFilterOptions = {
  /** 選択可能なステータス（カラム名）一覧 */
  statuses: readonly string[];
  /** 選択可能なラベル名一覧 */
  labels: readonly string[];
  /** 選択可能なマイルストーン名一覧 */
  milestoneNames: readonly string[];
};

/**
 * 利用可能な選択肢から外れた条件を間引く。カラムのリネーム/削除やマイルストーン削除で
 * UI に出なくなった条件が「隠れフィルタ」として残り続けるのを防ぐ。
 * 選択肢に依存しない keyword / priorities は保持する。
 * @param criteria - 現在の絞り込み条件
 * @param options - 現在利用可能な選択肢
 * @returns 間引き後の条件
 */
export const pruneTaskFilter = (
  criteria: TaskFilterCriteria,
  options: TaskFilterOptions,
): TaskFilterCriteria => {
  const statuses = criteria.statuses.filter((status) =>
    options.statuses.includes(status),
  );
  const labels = criteria.labels.filter((label) =>
    options.labels.includes(label),
  );
  const milestone =
    criteria.milestone.kind === "milestone" &&
    !options.milestoneNames.includes(criteria.milestone.name)
      ? ({ kind: "all" } as const)
      : criteria.milestone;
  return { ...criteria, statuses, labels, milestone };
};
