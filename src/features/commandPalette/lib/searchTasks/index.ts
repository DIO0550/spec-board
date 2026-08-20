import type { Task } from "@/types/task";

/** 一致したフィールドの種別（結果の並び順と「なぜ一致したか」表示の根拠）。 */
export type TaskSearchMatchField =
  | "title"
  | "id"
  | "label"
  | "filePath"
  | "body";

/** 検索一致 1 件分。 */
export type TaskSearchMatch = {
  /** 一致したタスク */
  task: Task;
  /**
   * 最も優先度の高い一致フィールド。
   * 空クエリ（全件返却）のときは undefined。
   */
  field?: TaskSearchMatchField;
  /** 本文一致時の一致箇所周辺の抜粋（本文一致以外は undefined） */
  excerpt?: string;
};

/** 小文字正規化済みの検索索引 1 件分。 */
export type TaskSearchEntry = {
  task: Task;
  title: string;
  id: string;
  labels: string[];
  filePath: string;
  body: string;
};

/** フィールドごとの並び順の重み（大きいほど先頭）。 */
const FIELD_WEIGHT: Record<TaskSearchMatchField, number> = {
  title: 5,
  id: 4,
  label: 3,
  filePath: 2,
  body: 1,
};

/** 本文抜粋で一致箇所の前後に残す文字数。 */
const EXCERPT_CONTEXT = 30;

/** @param tasks - 検索対象 @returns 正規化済み検索索引 */
export const createTaskSearchIndex = (
  tasks: readonly Task[],
): TaskSearchEntry[] =>
  tasks.map((task) => ({
    task,
    title: task.title.toLowerCase(),
    id: task.id.toLowerCase(),
    labels: task.labels.map((label) => label.toLowerCase()),
    filePath: task.filePath.toLowerCase(),
    body: task.body.toLowerCase(),
  }));

/**
 * クエリを空白（半角・全角）区切りの小文字トークンへ分解する。
 * @param query - 入力クエリ
 * @returns 空要素を除いたトークン列
 */
const tokenize = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/[\s　]+/)
    .filter((token) => token.length > 0);

/**
 * 1 トークンが一致する最優先フィールドを返す。
 * @param entry - 正規化済み索引
 * @param token - 小文字化済みトークン
 * @returns 一致フィールド。どこにも一致しなければ undefined
 */
const matchFieldOf = (
  entry: TaskSearchEntry,
  token: string,
): TaskSearchMatchField | undefined => {
  if (entry.title.includes(token)) {
    return "title";
  }
  if (entry.id.includes(token)) {
    return "id";
  }
  if (entry.labels.some((label) => label.includes(token))) {
    return "label";
  }
  if (entry.filePath.includes(token)) {
    return "filePath";
  }
  if (entry.body.includes(token)) {
    return "body";
  }
  return undefined;
};

/**
 * 本文の一致箇所周辺を抜粋する。前後が切れている側には「…」を付ける。
 * @param body - 元の本文
 * @param lowerBody - 小文字化済み本文（一致位置の検索用）
 * @param token - 小文字化済みトークン
 * @returns 抜粋文字列。一致しなければ undefined
 */
const excerptOf = (
  body: string,
  lowerBody: string,
  token: string,
): string | undefined => {
  const index = lowerBody.indexOf(token);
  if (index < 0) {
    return undefined;
  }
  const start = Math.max(0, index - EXCERPT_CONTEXT);
  const end = Math.min(body.length, index + token.length + EXCERPT_CONTEXT);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return `${prefix}${body.slice(start, end)}${suffix}`;
};

/**
 * 索引を全文検索する。
 *
 * - 空・空白のみのクエリは全件をそのままの順で返す（palette の初期表示用）
 * - トークンは空白区切りの AND 解釈（フィールドをまたいで一致してよい）
 * - 大文字小文字を無視した部分一致で、title / id / label / filePath / body を対象にする
 * - 並びは「最優先一致フィールドの重み降順 → 入力順（board 表示順）」の安定ソート
 * @param entries - 検索索引
 * @param query - 入力語
 * @returns 一致タスクの一覧
 */
export const searchTaskIndex = (
  entries: readonly TaskSearchEntry[],
  query: string,
): TaskSearchMatch[] => {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return entries.map(({ task }) => ({ task }));
  }

  const scored: { match: TaskSearchMatch; weight: number; order: number }[] =
    [];
  entries.forEach((entry, order) => {
    const matchedFields: TaskSearchMatchField[] = [];
    for (const token of tokens) {
      const field = matchFieldOf(entry, token);
      if (field === undefined) {
        return;
      }
      matchedFields.push(field);
    }
    const best = matchedFields.reduce((left, right) =>
      FIELD_WEIGHT[left] >= FIELD_WEIGHT[right] ? left : right,
    );
    const bodyToken = tokens[matchedFields.indexOf("body")];
    scored.push({
      match: {
        task: entry.task,
        field: best,
        ...(best === "body" && bodyToken !== undefined
          ? { excerpt: excerptOf(entry.task.body, entry.body, bodyToken) }
          : {}),
      },
      weight: FIELD_WEIGHT[best],
      order,
    });
  });

  scored.sort((left, right) =>
    left.weight === right.weight
      ? left.order - right.order
      : right.weight - left.weight,
  );
  return scored.map((item) => item.match);
};

/** @param tasks - 検索対象 @param query - 入力語 @returns 一致タスクの一覧 */
export const searchTasks = (
  tasks: readonly Task[],
  query: string,
): TaskSearchMatch[] => searchTaskIndex(createTaskSearchIndex(tasks), query);
