/** カラム定義 */
export type Column = {
  /** カラム名 */
  name: string;
  /** 表示順序 */
  order: number;
  /** `#rrggbb` 形式のアクセント色。不正・欠落時は省略され、表示層がフォールバックパレットを適用する */
  color?: string;
};
