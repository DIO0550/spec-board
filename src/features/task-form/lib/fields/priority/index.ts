import type { Priority } from "@/types/task";

/** PriorityField が保持する値の型。UI 都合で空文字「未選択」を表現する */
export type PriorityField = Priority | "";

/**
 * 優先度 field の companion object。
 * 初期値と送信用正規化を pure function として提供する。
 */
export const PriorityField = {
  /**
   * 初期値を返す（未選択）。
   * @returns 空文字
   */
  initial: (): PriorityField => "",

  /**
   * 送信用に値を正規化する。空文字は undefined（未指定）に変換する。
   * @param v - 現在の値
   * @returns 正規化された Priority または undefined
   */
  normalize: (v: PriorityField): Priority | undefined =>
    v === "" ? undefined : v,
};
