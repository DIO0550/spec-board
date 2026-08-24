import type { TauriError } from "@/lib/tauri";
import { PROJECT_SWITCHED_MESSAGE } from "./constants";

/**
 * useProject hook が呼び出し側に返すエラー型。discriminated union。
 * - `tauri`: BE / dialog 由来の TauriError をそのまま運ぶ
 * - `invalid-state`: hook 内部状態が不正（loaded 以外で task/column method を呼んだ等）
 */
export type ProjectError =
  | { kind: "tauri"; error: TauriError }
  | {
      kind: "invalid-state";
      reason: ProjectInvalidStateReason;
      message: string;
    };

/** invalid-stateを処理判断に使う機械可読な理由。 */
export type ProjectInvalidStateReason =
  | "not-loaded"
  | "operation-rejected"
  | "project-switched";

type ProjectSwitchedError = Extract<ProjectError, { kind: "invalid-state" }> & {
  reason: "project-switched";
};

/**
 * project切替により失敗したProjectErrorかを判定する。
 * @param error 判定対象のProjectError
 * @returns project切替を示すinvalid-stateの場合はtrue
 */
export const isProjectSwitchedError = (
  error: ProjectError,
): error is ProjectSwitchedError =>
  error.kind === "invalid-state" && error.reason === "project-switched";

export const ProjectError = {
  /**
   * useProject の状態不整合を表す error を作成する。
   *
   * @param message 呼び出し側に返す説明文
   * @returns invalid-state の ProjectError
   */
  invalidState: (message?: string): ProjectError => {
    if (message === undefined) {
      return {
        kind: "invalid-state",
        reason: "not-loaded",
        message: "プロジェクトが開かれていません",
      };
    }
    return {
      kind: "invalid-state",
      reason: "operation-rejected",
      message,
    };
  },

  /**
   * active projectの切替によるstale command errorを作成する。
   * @returns project-switchedのProjectError
   */
  projectSwitched: (): ProjectError => ({
    kind: "invalid-state",
    reason: "project-switched",
    message: PROJECT_SWITCHED_MESSAGE,
  }),

  /**
   * Tauri command 由来の error を ProjectError として包む。
   *
   * @param error Tauri command / dialog から返された error
   * @returns tauri の ProjectError
   */
  tauri: (error: TauriError): ProjectError => ({
    kind: "tauri",
    error,
  }),
} as const;
