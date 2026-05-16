import type { TauriError } from "@/lib/tauri";

/**
 * useProject hook が呼び出し側に返すエラー型。discriminated union。
 * - `tauri`: BE / dialog 由来の TauriError をそのまま運ぶ
 * - `invalid-state`: hook 内部状態が不正（loaded 以外で task/column method を呼んだ等）
 * - `partial-move`: カラム間移動で status 更新は成功したが card-order 保存に失敗した
 *   ケース。「失敗」とだけ伝えると実際は移動済みなのに「失敗扱い」となるため区別する
 */
export type ProjectError =
  | { kind: "tauri"; error: TauriError }
  | { kind: "invalid-state"; message: string }
  | { kind: "partial-move"; message: string; underlying: TauriError };

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

  /**
   * カラム間移動の途中失敗を表す error を作成する。status 更新は成功したが
   * card-order 保存に失敗したケースで使う。
   *
   * @param underlying card-order IPC が返した TauriError
   * @returns partial-move の ProjectError
   */
  partialMove: (underlying: TauriError): ProjectError => ({
    kind: "partial-move",
    message:
      "カラムの移動は完了しましたが、並び順の保存に失敗しました。手動で並び替えてください。",
    underlying,
  }),
} as const;
