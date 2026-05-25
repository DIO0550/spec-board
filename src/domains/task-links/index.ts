import type { Task } from "@/types/task";
import { arrayShallowEq } from "@/utils/array";

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

/** rollback 判定 helper 群の共通引数。 */
export type RestoreLinksArgs = {
  /** 楽観 dispatch 前の links snapshot */
  readonly snapshot: TaskLinks;
  /** 楽観 dispatch で流した links */
  readonly optimistic: TaskLinks;
  /** rollback 直前の最新 links */
  readonly current: TaskLinks;
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
  for (const p of args.self.links.linkedFilePaths) {
    excluded.add(p);
  }
  for (const p of args.self.links.reverseLinkedFilePaths) {
    excluded.add(p);
  }
  if (args.parentFilePath !== null) {
    excluded.add(args.parentFilePath);
  }
  for (const p of args.childrenFilePaths) {
    excluded.add(p);
  }
  return args.allTasks.filter((task) => !excluded.has(task.filePath));
};

/**
 * source 側の楽観反映用。`linkedFilePaths` に `target` を append した新 links を返す。
 * 既に含まれていれば元 links を同一参照で返す。
 *
 * @param links 元の links
 * @param target append する link 先 filePath
 * @returns 追加後の links（重複時は元の参照）
 */
const appendLinkedFilePath = (links: TaskLinks, target: string): TaskLinks => {
  if (links.linkedFilePaths.includes(target)) {
    return links;
  }
  return {
    ...links,
    linkedFilePaths: [...links.linkedFilePaths, target],
  };
};

/**
 * target 側の楽観反映用。`reverseLinkedFilePaths` に `source` を append した新 links を返す。
 * 既に含まれていれば元 links を同一参照で返す。
 *
 * @param links 元の links
 * @param source append する link 元 filePath
 * @returns 追加後の links（重複時は元の参照）
 */
const appendReverseLinkedFilePath = (
  links: TaskLinks,
  source: string,
): TaskLinks => {
  if (links.reverseLinkedFilePaths.includes(source)) {
    return links;
  }
  return {
    ...links,
    reverseLinkedFilePaths: [...links.reverseLinkedFilePaths, source],
  };
};

/**
 * source 側 rollback 判定。
 *
 * `current.linkedFilePaths` が `optimistic.linkedFilePaths` と順序込みで一致する場合のみ、
 * `snapshot.linkedFilePaths` を current に差し戻した新 links を返す。
 * IPC 中に別経路で `linkedFilePaths` が触られていれば undefined を返し、
 * 呼出側で rollback dispatch をスキップさせる契約。
 *
 * @param args snapshot / optimistic / current の 3 値
 * @returns rollback 用の links。一致しない場合は undefined
 */
const restoreLinkedFilePathsIfStillOptimistic = (
  args: RestoreLinksArgs,
): TaskLinks | undefined => {
  if (
    !arrayShallowEq(
      args.current.linkedFilePaths,
      args.optimistic.linkedFilePaths,
    )
  ) {
    return undefined;
  }
  return {
    ...args.current,
    linkedFilePaths: args.snapshot.linkedFilePaths,
  };
};

/**
 * target 側 rollback 判定。source 側と同型。
 *
 * `current.reverseLinkedFilePaths` が `optimistic.reverseLinkedFilePaths` と順序込みで一致する場合のみ、
 * `snapshot.reverseLinkedFilePaths` を current に差し戻した新 links を返す。
 * 一致しない場合は undefined を返し、外部更新を尊重して rollback dispatch をスキップさせる契約。
 *
 * @param args snapshot / optimistic / current の 3 値
 * @returns rollback 用の links。一致しない場合は undefined
 */
const restoreReverseLinkedFilePathsIfStillOptimistic = (
  args: RestoreLinksArgs,
): TaskLinks | undefined => {
  if (
    !arrayShallowEq(
      args.current.reverseLinkedFilePaths,
      args.optimistic.reverseLinkedFilePaths,
    )
  ) {
    return undefined;
  }
  return {
    ...args.current,
    reverseLinkedFilePaths: args.snapshot.reverseLinkedFilePaths,
  };
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
  appendLinkedFilePath,
  appendReverseLinkedFilePath,
  restoreLinkedFilePathsIfStillOptimistic,
  restoreReverseLinkedFilePathsIfStillOptimistic,
} as const;
