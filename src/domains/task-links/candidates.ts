import {
  normalizeRefPathForLookup,
  normalizeTaskPathForLookup,
} from "@/domains/task-path";
import type { Task } from "@/types/task";

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
 * 候補母集団から `self` 自身・既存 link 関係・親子関係を除いた候補配列を返す。
 *
 * @param args 母集団と除外対象
 * @returns add-link 候補となる Task 配列
 */
export const buildAddLinkCandidates = (
  args: BuildAddLinkCandidatesArgs,
): Task[] => {
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
export const buildCreateLinkCandidates = (
  args: BuildCreateLinkCandidatesArgs,
): Task[] => {
  const excluded = new Set<string>(args.selectedFilePaths);
  if (args.parentFilePath !== undefined) {
    excluded.add(args.parentFilePath);
  }
  return args.allTasks.filter((task) => !excluded.has(task.filePath));
};
