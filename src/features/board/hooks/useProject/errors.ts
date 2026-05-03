import type { TauriError } from "@/lib/tauri";

/**
 * useProject hook が呼び出し側に返すエラー型。discriminated union。
 * - `tauri`: BE / dialog 由来の TauriError をそのまま運ぶ
 * - `invalid-state`: hook 内部状態が不正（loaded 以外で CRUD method を呼んだ等）
 */
export type ProjectError =
  | { kind: "tauri"; error: TauriError }
  | { kind: "invalid-state"; message: string };
