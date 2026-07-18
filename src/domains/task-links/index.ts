import {
  linkReferencesTaskPath,
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type { Task } from "@/types/task";

/** Task の関連リンク情報 */
export type TaskLinks = {
  /** 関連タスクのファイルパスの配列 */
  linkedFilePaths: string[];
  /** 逆方向リンクのファイルパスの配列（links から逆引き） */
  reverseLinkedFilePaths: string[];
};

/** `buildAddLinkCandidates` 引数。 */
export type BuildAddLinkCandidatesArgs = {
  /** 候補集合の母集団から除外する自タスク */
  readonly self: Task;
  /** 候補母集団のタスク一覧 */
  readonly allTasks: readonly Task[];
  /** 親タスクの filePath（無ければ null） */
  readonly parentFilePath: string | null;
  /** 子タスクの filePath 配列 */
  readonly childrenFilePaths: readonly string[];
};

/**
 * `buildCreateLinkCandidates` 引数。作成フローには自タスク・children が存在しない
 * ため `buildAddLinkCandidatesArgs` とは別型。
 */
export type BuildCreateLinkCandidatesArgs = {
  /** 候補母集団のタスク一覧 */
  readonly allTasks: readonly Task[];
  /** 親タスクの filePath（未選択なら undefined） */
  readonly parentFilePath: string | undefined;
  /** 既に links に選択済みの filePath 配列 */
  readonly selectedFilePaths: readonly string[];
};

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
const applyLinkOperationsToTask = (
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
const linkOperationTargetFilePaths = (
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
 * `planAddLink` / `planRemoveLink` 共通の入力。lookup は action 側の責務。
 * - add: `targetFilePath` は canonical（`buildAddLinkCandidates` 由来の `Task.filePath`）。
 *   source / target とも完全一致 lookup で引き当てた Task を渡す
 * - remove: `targetFilePath` は frontmatter 由来の raw 値（`./tasks/b.md` 等）のまま渡す。
 *   target には参照解決 lookup（`linkReferencesTaskPath` で表記揺れ吸収）で解決した
 *   Task を渡す（解決不能 = broken link なら undefined）。plan はこの対応関係を再検証しない
 */
export type LinkIntent = {
  /** リンク元タスクの filePath */
  readonly sourceFilePath: string;
  /** リンク先の filePath（add は canonical / remove は raw 値） */
  readonly targetFilePath: string;
  /** state から引き当てた source Task（不在なら undefined） */
  readonly source: Task | undefined;
  /** state から引き当てた target Task（不在なら undefined） */
  readonly target: Task | undefined;
};

/** `planAddLink` の reject 理由 */
export type AddLinkRejectReason =
  | "source-not-found"
  | "self-link"
  | "target-not-found";

/** `planRemoveLink` の reject 理由 */
export type RemoveLinkRejectReason = "source-not-found";

/** `planAddLink` の結果（判別 union） */
export type AddLinkOutcome =
  | {
      readonly kind: "apply";
      readonly optimistic: readonly LinkOperation[];
      readonly rollback: readonly LinkOperation[];
    }
  | { readonly kind: "noop"; readonly task: Task }
  | { readonly kind: "rejected"; readonly reason: AddLinkRejectReason };

/** `planRemoveLink` の結果（判別 union） */
export type RemoveLinkOutcome =
  | {
      readonly kind: "apply";
      readonly optimistic: readonly LinkOperation[];
      readonly rollback: readonly LinkOperation[];
    }
  | { readonly kind: "noop"; readonly task: Task }
  | { readonly kind: "rejected"; readonly reason: RemoveLinkRejectReason };

/** invert 時に元位置 `at` を引くための snapshot（plan 入力の source / target）。 */
type LinkPlanSnapshot = {
  readonly source: Task;
  readonly target: Task | undefined;
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
const invertLinkOperations = (
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

/**
 * link 追加の plan を計算する。検証（source 不在 / self-link / target 不在 / 既リンク）と
 * optimistic + inverse（rollback）計算を 1 箇所に集約した純粋計算。
 *
 * - 既リンク（noop）判定は `linkReferencesTaskPath` の正規化同値で行う
 * - operations は「snapshot に対して実際に変化を生むものだけ」を出力する
 *   （target が既に reverse を持つ場合は reverse operation を出さない）
 * - `requiresValueTask: true` は reverse append にのみ付与する
 *
 * @param args source / target の snapshot と filePath
 * @returns apply / noop / rejected の判別 union
 */
const planAddLink = (args: LinkIntent): AddLinkOutcome => {
  if (args.source === undefined) {
    return { kind: "rejected", reason: "source-not-found" };
  }
  if (args.targetFilePath === args.source.filePath) {
    return { kind: "rejected", reason: "self-link" };
  }
  if (args.target === undefined) {
    return { kind: "rejected", reason: "target-not-found" };
  }

  const targetFilePath = args.target.filePath;
  const alreadyLinked = args.source.links.linkedFilePaths.some((link) =>
    linkReferencesTaskPath(link, targetFilePath),
  );
  if (alreadyLinked) {
    return { kind: "noop", task: args.source };
  }

  const optimistic: LinkOperation[] = [
    {
      op: "append",
      filePath: args.source.filePath,
      field: "linkedFilePaths",
      value: targetFilePath,
    },
  ];
  const hasReverse = args.target.links.reverseLinkedFilePaths.includes(
    args.source.filePath,
  );
  if (!hasReverse) {
    optimistic.push({
      op: "append",
      filePath: targetFilePath,
      field: "reverseLinkedFilePaths",
      value: args.source.filePath,
      requiresValueTask: true,
    });
  }

  return {
    kind: "apply",
    optimistic,
    rollback: invertLinkOperations(optimistic, {
      source: args.source,
      target: args.target,
    }),
  };
};

/**
 * link 削除の plan を計算する。`targetFilePath` は frontmatter 由来の raw 値を前提とし、
 * 表記揺れは `linkReferencesTaskPath` の正規化同値で吸収する。
 *
 * - forward の除去対象は「削除対象を参照する正規化同値な raw 値すべて」を
 *   snapshot index の**降順**で各 1 operation として出力する（BE の一括除去と一致。
 *   `invertLinkOperations` の逆順反転により rollback の inverse append が index 昇順に
 *   なり、clamp 挿入でも全表記が元位置へ復元される）
 * - self-link 判定は「targetFilePath が source.filePath を参照するか」で行い、
 *   reverse の除去も source 自身への operation として出力する（呼出側で 1 dispatch に併合）
 * - target 解決不能（broken link）でも forward のみの apply として削除可能を維持する
 *
 * @param args source / target の snapshot と filePath（target は参照解決済み or undefined）
 * @returns apply / noop / rejected の判別 union
 */
const planRemoveLink = (args: LinkIntent): RemoveLinkOutcome => {
  if (args.source === undefined) {
    return { kind: "rejected", reason: "source-not-found" };
  }
  const source = args.source;

  const isSelfLink = linkReferencesTaskPath(
    args.targetFilePath,
    source.filePath,
  );
  const canonicalTargetFilePath = isSelfLink
    ? source.filePath
    : args.target?.filePath;

  const matchesRemovalTarget = (raw: string): boolean => {
    if (canonicalTargetFilePath !== undefined) {
      return linkReferencesTaskPath(raw, canonicalTargetFilePath);
    }
    if (raw === args.targetFilePath) {
      return true;
    }
    const rawLookupPath = normalizeRefPathForLookup(raw);
    if (rawLookupPath === undefined) {
      return false;
    }
    return rawLookupPath === normalizeRefPathForLookup(args.targetFilePath);
  };

  // 各 raw 値の「最初の出現 index」を収集し、その降順で remove operation を生成する。
  // rollback の inverse append は indexOf（= 最初の出現位置）を `at` に持つため、
  // 生成順も同じ「最初の出現 index」基準で降順に揃えないと、完全重複と別表記が
  // 混在した snapshot で復元順が崩れる（逆順反転後の append が昇順にならない）。
  const firstIndexByValue = new Map<string, number>();
  const forwardPaths = source.links.linkedFilePaths;
  forwardPaths.forEach((raw, index) => {
    if (firstIndexByValue.has(raw)) {
      return;
    }
    if (!matchesRemovalTarget(raw)) {
      return;
    }
    firstIndexByValue.set(raw, index);
  });
  const optimistic: LinkOperation[] = [...firstIndexByValue.entries()]
    .sort(([, indexA], [, indexB]) => indexB - indexA)
    .map(([raw]) => ({
      op: "remove" as const,
      filePath: source.filePath,
      field: "linkedFilePaths" as const,
      value: raw,
    }));
  if (optimistic.length === 0) {
    return { kind: "noop", task: source };
  }

  const selfReverseExists =
    isSelfLink && source.links.reverseLinkedFilePaths.includes(source.filePath);
  if (selfReverseExists) {
    optimistic.push({
      op: "remove",
      filePath: source.filePath,
      field: "reverseLinkedFilePaths",
      value: source.filePath,
    });
  }
  const targetReverseExists =
    !isSelfLink &&
    args.target !== undefined &&
    args.target.links.reverseLinkedFilePaths.includes(source.filePath);
  if (targetReverseExists && args.target !== undefined) {
    optimistic.push({
      op: "remove",
      filePath: args.target.filePath,
      field: "reverseLinkedFilePaths",
      value: source.filePath,
    });
  }

  return {
    kind: "apply",
    optimistic,
    rollback: invertLinkOperations(optimistic, {
      source,
      target: args.target,
    }),
  };
};

/**
 * `paths` から `filePath` を除いた新しい配列を返す。含まれていなければ元配列をそのまま返す。
 * @param paths 元の path 配列
 * @param filePath 除去対象の path
 * @returns 除去後の path 配列
 */
const removePath = (paths: string[], filePath: string): string[] => {
  if (!paths.includes(filePath)) {
    return paths;
  }

  return paths.filter((path) => path !== filePath);
};

/**
 * link/reverseLink の両方から指定 path を取り除いた `TaskLinks` を返す。
 * @param taskLinks 元の link 状態
 * @param linkedFilePath 除去対象の path
 * @returns 除去後の `TaskLinks`
 */
const removeLinkedPath = (
  taskLinks: TaskLinks,
  linkedFilePath: string,
): TaskLinks => ({
  linkedFilePaths: removePath(taskLinks.linkedFilePaths, linkedFilePath),
  reverseLinkedFilePaths: removePath(
    taskLinks.reverseLinkedFilePaths,
    linkedFilePath,
  ),
});

/**
 * 2 つの `TaskLinks` で配列参照が変わっているか判定する。
 * @param current 変更前の link 状態
 * @param next 変更後の link 状態
 * @returns 参照が変わっていれば true
 */
const hasLinkChanges = (current: TaskLinks, next: TaskLinks): boolean =>
  next.linkedFilePaths !== current.linkedFilePaths ||
  next.reverseLinkedFilePaths !== current.reverseLinkedFilePaths;

/**
 * 候補母集団から `self` 自身・既存 link 関係・親子関係を除いた候補配列を返す。
 *
 * @param args 母集団と除外対象
 * @returns add-link 候補となる Task 配列
 */
const buildAddLinkCandidates = (args: BuildAddLinkCandidatesArgs): Task[] => {
  const excluded = new Set<string>();
  excluded.add(args.self.filePath);
  if (args.parentFilePath !== null) {
    excluded.add(args.parentFilePath);
  }
  for (const p of args.childrenFilePaths) {
    excluded.add(p);
  }
  // 既リンク除外は raw 完全一致でなく正規化同値で行う
  // （`./tasks/b.md` が登録済みなら canonical `tasks/b.md` の task も候補に出さない）。
  // `linkReferencesTaskPath` の per-pair 照合を全 task × 全 link 参照で回すと
  // O(T×L) になるため、raw 完全一致 Set と正規化済み Set を事前構築し、
  // 候補 task 側は filePath を 1 回だけ正規化して照合する（同一の同値判定を保ったまま O(T+L)）
  const linkRefs = [
    ...args.self.links.linkedFilePaths,
    ...args.self.links.reverseLinkedFilePaths,
  ];
  const rawLinkRefs = new Set<string>(linkRefs);
  const normalizedLinkRefs = new Set<string>();
  for (const link of linkRefs) {
    const normalized = normalizeRefPathForLookup(link);
    if (normalized !== undefined) {
      normalizedLinkRefs.add(normalized);
    }
  }
  return args.allTasks.filter((task) => {
    if (excluded.has(task.filePath)) {
      return false;
    }
    if (rawLinkRefs.has(task.filePath)) {
      return false;
    }
    return !normalizedLinkRefs.has(normalizeTaskPathForLookup(task.filePath));
  });
};

/**
 * 作成フロー用の候補算出。母集団 `allTasks` から parent と選択済み filePath を
 * 除いた候補配列を返す。作成中タスクは未保存のため自己除外は不要。
 *
 * filePath は完全一致で除外する。UI 経由では parentFilePath / selectedFilePaths は
 * 常に `Task.filePath`（正規化済み）として渡る前提のため表記揺れは混入しない。
 *
 * @param args 母集団・parent・選択済み
 * @returns create-link 候補となる Task 配列
 */
const buildCreateLinkCandidates = (
  args: BuildCreateLinkCandidatesArgs,
): Task[] => {
  const excluded = new Set<string>(args.selectedFilePaths);
  if (args.parentFilePath !== undefined) {
    excluded.add(args.parentFilePath);
  }
  return args.allTasks.filter((task) => !excluded.has(task.filePath));
};

export const TaskLinks = {
  /**
   * Task の関連 link 関係から指定 task への参照を取り除く。
   *
   * @param task link 関係を掃除する task
   * @param linkedFilePath 取り除く関連 task の filePath
   * @returns link 関係が変われば更新後 task、変わらなければ元 task
   */
  removeLinkedTask: (task: Task, linkedFilePath: string): Task => {
    const taskLinks = removeLinkedPath(task.links, linkedFilePath);

    if (!hasLinkChanges(task.links, taskLinks)) {
      return task;
    }

    return { ...task, links: taskLinks };
  },
  buildAddLinkCandidates,
  buildCreateLinkCandidates,
  planAddLink,
  planRemoveLink,
  applyLinkOperationsToTask,
  linkOperationTargetFilePaths,
} as const;
