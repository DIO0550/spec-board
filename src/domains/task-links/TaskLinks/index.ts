import {
  linkReferencesTaskPath,
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type { Task, TaskFilePath } from "@/types/task";
import type { LinkIntent } from "../LinkIntent";
import {
  applyLinkOperationsToTask,
  invertLinkOperations,
  type LinkOperation,
  linkOperationTargetFilePaths,
} from "../LinkOperation";

/** Task の関連リンク情報 */
export type TaskLinks = {
  /** 関連タスクのファイルパスの配列 */
  linkedFilePaths: string[];
  /** 逆方向リンクのファイルパスの配列（links から逆引き） */
  reverseLinkedFilePaths: TaskFilePath[];
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

/** `buildAddLinkCandidates` 引数。 */
export type BuildAddLinkCandidatesArgs = {
  /** 候補集合の母集団から除外する自タスク */
  readonly self: Task;
  /** 候補母集団のタスク一覧 */
  readonly allTasks: readonly Task[];
  /** 親タスクの filePath（無ければ null） */
  readonly parentFilePath: string | null;
  /** 子タスクの filePath 配列 */
  readonly childrenFilePaths: readonly TaskFilePath[];
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

/**
 * `paths` から `filePath` を除いた新しい配列を返す。含まれていなければ元配列をそのまま返す。
 * @param paths 元の path 配列
 * @param filePath 除去対象の path
 * @returns 除去後の path 配列
 */
const removePath = <Path extends string>(
  paths: Path[],
  filePath: string,
): Path[] => {
  if (!paths.some((path) => path === filePath)) {
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
 * Task の関連 link 関係から指定 task への参照を取り除く。
 *
 * @param task link 関係を掃除する task
 * @param linkedFilePath 取り除く関連 task の filePath
 * @returns link 関係が変われば更新後 task、変わらなければ元 task
 */
const removeLinkedTask = (task: Task, linkedFilePath: string): Task => {
  const taskLinks = removeLinkedPath(task.links, linkedFilePath);

  if (!hasLinkChanges(task.links, taskLinks)) {
    return task;
  }

  return { ...task, links: taskLinks };
};

/**
 * task-links ドメインの companion API。
 *
 * - `removeLinkedTask`: task-deleted 時のリンク掃除（project-data 向け）
 * - `buildAddLinkCandidates` / `buildCreateLinkCandidates`: リンク候補算出（UI 向け）
 * - `planAddLink` / `planRemoveLink`: 楽観更新 + inverse rollback の計算（link action 向け）
 * - `applyLinkOperationsToTask` / `linkOperationTargetFilePaths`: operations の適用と
 *   dispatch グルーピング（optimistic / rollback 共通の適用セマンティクス）
 */
export const TaskLinks = {
  removeLinkedTask,
  buildAddLinkCandidates,
  buildCreateLinkCandidates,
  planAddLink,
  planRemoveLink,
  applyLinkOperationsToTask,
  linkOperationTargetFilePaths,
} as const;
