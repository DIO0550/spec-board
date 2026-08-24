import type {
  AddLinkRejectReason,
  LinkOperation,
  RemoveLinkRejectReason,
} from "@/domains/task-links";
import { TaskLinks } from "@/domains/task-links";
import { linkReferencesTaskPath } from "@/domains/task-path";
import type { Task, TaskFilePath } from "@/types/task";
import { ProjectError } from "../errors";
import { ProjectState } from "../state/projectState";
import type { TaskActionDeps } from "./deps";

/**
 * filePath で現在の Task を visibleData から引き当てる（link 2 action の共有 lookup）。
 *
 * @param state 現在の project state
 * @param filePath 引き当てる task の filePath（canonical 完全一致）
 * @returns 見つかれば Task、無ければ undefined
 */
export const findLinkTask = (
  state: ProjectState,
  filePath: TaskFilePath,
): Task | undefined =>
  ProjectState.visibleData(state)?.tasks.find(
    (task) => task.filePath === filePath,
  );

/**
 * raw な link 参照（`./tasks/b.md` 等の表記揺れ）から現在の Task を引き当てる。
 * remove の target 解決用。まず全 task に対して canonical 完全一致を試し、
 * 見つからない場合のみ `linkReferencesTaskPath` の正規化同値で吸収する
 * （正規化同値の task が配列前方にあっても完全一致の task が優先される）。
 *
 * @param state 現在の project state
 * @param reference frontmatter 由来の raw 参照
 * @returns 参照が指す Task、解決不能（broken link）なら undefined
 */
export const findLinkTaskByReference = (
  state: ProjectState,
  reference: string,
): Task | undefined => {
  const tasks = ProjectState.visibleData(state)?.tasks;
  if (tasks === undefined) {
    return undefined;
  }
  const exact = tasks.find((task) => task.filePath === reference);
  if (exact !== undefined) {
    return exact;
  }
  return tasks.find((task) => linkReferencesTaskPath(reference, task.filePath));
};

/**
 * 参照整合ガード対象の operation か判定する。
 * op="append" かつ `requiresValueTask` 付き（= reverse field への append）のみが対象。
 *
 * @param operation 判定する operation
 * @returns ガード対象なら true
 */
const isGuardedAppend = (operation: LinkOperation): boolean =>
  operation.op === "append" && operation.requiresValueTask === true;

/**
 * operations を task 単位に併合して `task-updated` を dispatch する。
 * optimistic / rollback の両経路で同一の適用セマンティクスを共有する。
 *
 * - 参照整合ガード: `requiresValueTask` 付き append（= reverse field への append）のみ、
 *   value が指す task が適用時点の state に不在ならその operation を除外する
 *   （value は `findLinkTaskByReference` で表記揺れ込みで解決。plan 後に外部削除された
 *   task への逆リンク復活を防止する）。forward append は disk 保持リンクの復元に
 *   あたるため常に flag なしで無条件適用し、remove 系 operation はガード対象外
 * - 対象 task が state に不在（並行削除等）→ その task は skip
 * - 適用しても変化なし（同一参照）→ dispatch skip
 *
 * @param deps state getter と dispatcher
 * @param operations 適用する operations
 */
export const dispatchLinkOperations = (
  deps: TaskActionDeps,
  operations: readonly LinkOperation[],
): void => {
  const guarded = operations.filter((operation) => {
    if (!isGuardedAppend(operation)) {
      return true;
    }
    return (
      findLinkTaskByReference(deps.getState(), operation.value) !== undefined
    );
  });

  for (const filePath of TaskLinks.linkOperationTargetFilePaths(guarded)) {
    const task = findLinkTask(deps.getState(), filePath);
    if (task === undefined) {
      continue;
    }
    const applied = TaskLinks.applyLinkOperationsToTask(task, guarded);
    if (applied === task) {
      continue;
    }
    deps.dispatch({
      type: "task-updated",
      originalFilePath: filePath,
      task: applied,
    });
  }
};

/**
 * plan の rejected reason を ProjectError（invalidState + 日本語メッセージ）へ変換する。
 *
 * @param reason plan が返した reject 理由
 * @returns 対応する ProjectError
 */
export const linkRejectReasonToError = (
  reason: AddLinkRejectReason | RemoveLinkRejectReason,
): ProjectError => {
  switch (reason) {
    case "source-not-found": {
      return ProjectError.invalidState("リンク元のタスクが見つかりません");
    }
    case "self-link": {
      return ProjectError.invalidState("自分自身へはリンクできません");
    }
    case "target-not-found": {
      return ProjectError.invalidState("リンク先のタスクが見つかりません");
    }
    default: {
      return reason satisfies never;
    }
  }
};
