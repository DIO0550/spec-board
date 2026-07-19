import {
  buildAddLinkCandidates,
  buildCreateLinkCandidates,
} from "./candidates";
import {
  applyLinkOperationsToTask,
  linkOperationTargetFilePaths,
} from "./linkOperation";
import { planAddLink, planRemoveLink } from "./plan";
import { removeLinkedTask } from "./removeLinkedTask";
import type { TaskLinks as TaskLinksModel } from "./types";

export type {
  BuildAddLinkCandidatesArgs,
  BuildCreateLinkCandidatesArgs,
} from "./candidates";
export type { LinkOperation } from "./linkOperation";
export type {
  AddLinkIntentArgs,
  AddLinkOutcome,
  AddLinkRejectReason,
  LinkTaskLookup,
  RemoveLinkIntentArgs,
  RemoveLinkOutcome,
  RemoveLinkRejectReason,
} from "./plan";
// LinkIntent は型 + companion（forAdd / forRemove）の同名公開のため値ごと re-export する
export { LinkIntent } from "./plan";
// 同名の companion 定数と型を 1 モジュールから公開するため、re-export でなく
// ローカル型 alias として宣言する（re-export はローカルの const と名前空間 merge されない）
export type TaskLinks = TaskLinksModel;

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
