import {
  linkReferencesTaskPath,
  normalizeRefPathForLookup,
} from "@/domains/task-path";
import type { Task } from "@/types/task";
import type { LinkOperation } from "./linkOperation";

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

/** filePath / 参照から Task を引き当てる lookup（state への依存は呼出側が閉じる）。 */
export type LinkTaskLookup = (filePath: string) => Task | undefined;

/** `LinkIntent.forAdd` の引数。 */
export type AddLinkIntentArgs = {
  /** リンク元タスクの filePath */
  readonly sourceFilePath: string;
  /** リンク先タスクの canonical filePath（`buildAddLinkCandidates` 由来） */
  readonly targetFilePath: string;
  /** canonical 完全一致 lookup */
  readonly findTask: LinkTaskLookup;
};

/** `LinkIntent.forRemove` の引数。 */
export type RemoveLinkIntentArgs = {
  /** リンク元タスクの filePath */
  readonly sourceFilePath: string;
  /** 削除するリンクの raw 値（`linkedFilePaths` の要素。表記揺れ可） */
  readonly targetFilePath: string;
  /** canonical 完全一致 lookup（source の引き当て用） */
  readonly findTask: LinkTaskLookup;
  /** raw 参照の解決 lookup（target の引き当て用。解決不能なら undefined を返す） */
  readonly findTaskByReference: LinkTaskLookup;
};

/**
 * `LinkIntent` の companion API。plan 入力の構築時に使う lookup の使い分け契約
 * （add = source / target とも canonical 完全一致、remove = source は canonical・
 * target は raw 参照の正規化同値解決）をドメイン側に固定する。
 */
export const LinkIntent = {
  /**
   * add 用の intent を構築する。source / target とも canonical 完全一致 lookup で
   * 引き当てる（targetFilePath は候補 UI 由来の `Task.filePath` 前提）。
   *
   * @param args filePath ペアと lookup
   * @returns planAddLink へ渡す intent
   */
  forAdd: (args: AddLinkIntentArgs): LinkIntent => ({
    sourceFilePath: args.sourceFilePath,
    targetFilePath: args.targetFilePath,
    source: args.findTask(args.sourceFilePath),
    target: args.findTask(args.targetFilePath),
  }),
  /**
   * remove 用の intent を構築する。source は canonical 完全一致、target は
   * raw 参照（表記揺れ）の解決 lookup で引き当てる（解決不能 = broken link なら
   * target は undefined のまま plan が forward のみの apply を返す）。
   *
   * @param args filePath ペアと lookup 2 種
   * @returns planRemoveLink へ渡す intent
   */
  forRemove: (args: RemoveLinkIntentArgs): LinkIntent => ({
    sourceFilePath: args.sourceFilePath,
    targetFilePath: args.targetFilePath,
    source: args.findTask(args.sourceFilePath),
    target: args.findTaskByReference(args.targetFilePath),
  }),
} as const;

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
export const planAddLink = (args: LinkIntent): AddLinkOutcome => {
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
export const planRemoveLink = (args: LinkIntent): RemoveLinkOutcome => {
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
