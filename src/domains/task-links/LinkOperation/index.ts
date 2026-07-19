import type { Task } from "@/types/task";
import type { TaskLinks } from "../TaskLinks";

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

/** invert 時に元位置 `at` を引くための snapshot（plan 入力の source / target）。 */
export type LinkPlanSnapshot = {
  readonly source: Task;
  readonly target: Task | undefined;
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

/**
 * snapshot から operation の適用先 field 配列を引き当てる。
 * @param snapshot plan 入力の source / target
 * @param operation 対象 operation
 * @returns 該当 task の該当 field 配列（task 不一致なら undefined）
 */
const snapshotFieldValues = (
  snapshot: LinkPlanSnapshot,
  operation: LinkOperation,
): readonly string[] | undefined => {
  if (operation.filePath === snapshot.source.filePath) {
    return snapshot.source.links[operation.field];
  }
  if (operation.filePath === snapshot.target?.filePath) {
    return snapshot.target.links[operation.field];
  }
  return undefined;
};

/**
 * snapshot の field 配列から「value → 実効復元 index」の対応表を 1 パスで前計算する。
 *
 * 基準は各 value の最初の出現 index だが、rollback は各 value につき 1 件しか
 * 復元しない（完全重複の復元は 1 件のみ）ため、自分より前にある
 * 「復元されない完全重複エントリ（除去対象 value の 2 個目以降の出現）」の数だけ
 * 位置を詰めた実効 index を記録する。これを怠ると、完全重複と別表記が混在する
 * snapshot で復元後の相対順が崩れる。
 *
 * @param fieldValues snapshot の該当 field 配列
 * @param removedValues 同じ filePath / field で除去される value の集合
 * @returns 除去対象 value → 実効復元 index の Map
 */
const buildRestoreIndexMap = (
  fieldValues: readonly string[],
  removedValues: ReadonlySet<string>,
): Map<string, number> => {
  const restoreIndexByValue = new Map<string, number>();
  let unrestoredBefore = 0;
  fieldValues.forEach((value, index) => {
    if (!removedValues.has(value)) {
      return;
    }
    if (restoreIndexByValue.has(value)) {
      unrestoredBefore += 1;
      return;
    }
    restoreIndexByValue.set(value, index - unrestoredBefore);
  });
  return restoreIndexByValue;
};

/** filePath ごとに field 別の値集合 / 対応表を束ねるレコード。 */
type PerFieldSets = Partial<Record<LinkOperation["field"], Set<string>>>;
type PerFieldRestoreIndex = Partial<
  Record<LinkOperation["field"], Map<string, number>>
>;

/**
 * optimistic operations から inverse（逆順 + op 反転）の rollback operations を導出する。
 *
 * - append → remove: `at` / `requiresValueTask` は付与しない（remove はガード非関与）
 * - remove → append: snapshot 内の value の元位置（最初の出現 index を、復元されない
 *   完全重複分だけ詰めた実効 index — `buildRestoreIndexMap`）を `at` として記録し、
 *   `reverseLinkedFilePaths` への append にのみ `requiresValueTask: true` を付与する
 *   （forward append = disk 保持リンクの復元は常に flag なし = 無条件復元）。
 *   `planRemoveLink` が forward remove operations を「最初の出現 index」の降順で
 *   生成するため、逆順反転後の rollback append は index 昇順で適用され、
 *   clamp 挿入でも元位置に揃う
 *
 * @param operations optimistic operations
 * @param snapshot plan 入力の source / target（元位置の記録用）
 * @returns rollback operations
 */
export const invertLinkOperations = (
  operations: readonly LinkOperation[],
  snapshot: LinkPlanSnapshot,
): readonly LinkOperation[] => {
  // filePath → field → 「除去される value の集合」（実効 index の計算用）
  const removedValuesByFilePath = new Map<string, PerFieldSets>();
  for (const operation of operations) {
    if (operation.op !== "remove") {
      continue;
    }
    const perField = removedValuesByFilePath.get(operation.filePath) ?? {};
    const values = perField[operation.field] ?? new Set<string>();
    values.add(operation.value);
    perField[operation.field] = values;
    removedValuesByFilePath.set(operation.filePath, perField);
  }

  // filePath → field → 「value → 実効復元 index」（field 配列 1 パスの前計算を lazy に共有）
  const restoreIndexByFilePath = new Map<string, PerFieldRestoreIndex>();
  /**
   * remove operation の inverse append が使う実効復元 index を返す。
   * filePath / field 単位で `buildRestoreIndexMap` の結果をキャッシュし、
   * 同じ field への複数 operation でも snapshot 走査を 1 回に抑える。
   * @param operation 反転対象の remove operation
   * @returns 実効復元 index（snapshot に該当 task / value が無ければ undefined）
   */
  const restoreIndexFor = (operation: LinkOperation): number | undefined => {
    const fieldValues = snapshotFieldValues(snapshot, operation);
    if (fieldValues === undefined) {
      return undefined;
    }
    const perField = restoreIndexByFilePath.get(operation.filePath) ?? {};
    const cached = perField[operation.field];
    if (cached !== undefined) {
      return cached.get(operation.value);
    }
    const removedValues =
      removedValuesByFilePath.get(operation.filePath)?.[operation.field] ??
      new Set<string>();
    const restoreIndexByValue = buildRestoreIndexMap(
      fieldValues,
      removedValues,
    );
    perField[operation.field] = restoreIndexByValue;
    restoreIndexByFilePath.set(operation.filePath, perField);
    return restoreIndexByValue.get(operation.value);
  };

  return [...operations].reverse().map((operation) => {
    if (operation.op === "append") {
      return {
        op: "remove" as const,
        filePath: operation.filePath,
        field: operation.field,
        value: operation.value,
      };
    }

    const at = restoreIndexFor(operation);
    if (operation.field === "reverseLinkedFilePaths") {
      return {
        op: "append" as const,
        filePath: operation.filePath,
        field: operation.field,
        value: operation.value,
        at,
        requiresValueTask: true as const,
      };
    }
    return {
      op: "append" as const,
      filePath: operation.filePath,
      field: operation.field,
      value: operation.value,
      at,
    };
  });
};
