import { Due } from "@/domains/due";

/** DueField が保持する値（`YYYY-MM-DD` または空文字 = 未設定） */
export type DueField = string;

/**
 * 期限 field の companion object。
 * 検証は branded `Due` ドメイン（`Due.parse`）に完全委譲し、独自の検証ロジックを持たない。
 */
export const DueField = {
  /**
   * 初期値を返す。
   * @returns 空文字（未設定）
   */
  initial: (): DueField => "",

  /**
   * 送信値を返す。空文字・不正フォーマットは undefined（due キーを出力しない）。
   * @param v - 現在の値
   * @returns 正当な `YYYY-MM-DD` のみ文字列、それ以外は undefined
   */
  toParam: (v: DueField): string | undefined => Due.parse(v),
};
