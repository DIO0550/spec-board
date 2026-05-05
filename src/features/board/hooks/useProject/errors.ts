import type { TauriError } from "@/lib/tauri";

/**
 * useProject hook が呼び出し側に返すエラー型。discriminated union。
 * - `tauri`: BE / dialog 由来の TauriError をそのまま運ぶ
 * - `invalid-state`: hook 内部状態が不正（loaded 以外で task/column method を呼んだ等）
 */
export type ProjectError =
  | { kind: "tauri"; error: TauriError }
  | { kind: "invalid-state"; message: string };

export const ProjectError = {
  /**
   * useProject の状態不整合を表す error を作成する。
   *
   * @param message 呼び出し側に返す説明文
   * @returns invalid-state の ProjectError
   */
  invalidState: (message = "プロジェクトが開かれていません"): ProjectError => ({
    kind: "invalid-state",
    message,
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
