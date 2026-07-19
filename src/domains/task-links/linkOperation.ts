import type { Task } from "@/types/task";
import type { TaskLinks } from "./types";

/**
 * link 変更 1 件の操作。
 *
 * `at` / `requiresValueTask` は **append のみ有効** な field。生成者は
 * `planAddLink` / `planRemoveLink` に閉じているため、union による構造的制約より
 * 単純さを優先した単一オブジェクト型とし、apply 実装は remove では両 field を無視する。
 */
export type LinkOperation = {
  /** 操作種別 */
  readonly op: "append" | "remove";
  /** 適用先 task の filePath */
  readonly filePath: string;
  /** 適用先 field */
  readonly field: "linkedFilePaths" | "reverseLinkedFilePaths";
  /** append / remove する path 値 */
  readonly value: string;
  /** append のみ有効: 挿入位置（省略時は末尾。適用時に min(at, 現在長) へ clamp） */
  readonly at?: number;
  /** append のみ有効: reverse append の参照整合ガード（value の task が適用時点で不在なら skip） */
  readonly requiresValueTask?: true;
};

/**
 * operation 1 件を links に適用する。変化がなければ同一参照を返す。
 *
 * - append: 既に含まれていれば同一参照。なければ `min(at ?? 現在長, 現在長)` に
 *   clamp した位置へ挿入する（snapshot 時点の数値 index への best-effort 挿入）
 * - remove: 含まれていなければ同一参照。あれば value 完全一致の全エントリを除去する
 *   （同一文字列の完全重複は一括削除）
 *
 * @param links 元の links
 * @param operation 適用する operation
 * @returns 適用後の links（変化なしなら元の参照）
 */
const applyLinkOperation = (
  links: TaskLinks,
  operation: LinkOperation,
): TaskLinks => {
  const current = links[operation.field];

  if (operation.op === "append") {
    if (current.includes(operation.value)) {
      return links;
    }
    const insertAt = Math.min(operation.at ?? current.length, current.length);
    const appended = [
      ...current.slice(0, insertAt),
      operation.value,
      ...current.slice(insertAt),
    ];
    return { ...links, [operation.field]: appended };
  }

  if (!current.includes(operation.value)) {
    return links;
  }
  return {
    ...links,
    [operation.field]: current.filter((path) => path !== operation.value),
  };
};

/**
 * task の filePath に一致する operations のみを適用する。変化がなければ
 * 同一参照の task を返す（呼出側の dispatch skip 契約）。
 *
 * @param task 適用先 task
 * @param operations 適用する operations（他 task 向けが混在してよい）
 * @returns 適用後の task（変化なしなら元の参照）
 */
export const applyLinkOperationsToTask = (
  task: Task,
  operations: readonly LinkOperation[],
): Task => {
  const nextLinks = operations
    .filter((operation) => operation.filePath === task.filePath)
    .reduce(applyLinkOperation, task.links);

  if (nextLinks === task.links) {
    return task;
  }
  return { ...task, links: nextLinks };
};

/**
 * operations が触る task filePath を出現順 unique で列挙する（dispatch のグルーピング用）。
 *
 * @param operations 対象 operations
 * @returns 出現順の重複なし filePath 配列
 */
export const linkOperationTargetFilePaths = (
  operations: readonly LinkOperation[],
): readonly string[] => {
  const seen = new Set<string>();
  const filePaths: string[] = [];
  for (const operation of operations) {
    if (seen.has(operation.filePath)) {
      continue;
    }
    seen.add(operation.filePath);
    filePaths.push(operation.filePath);
  }
  return filePaths;
};
