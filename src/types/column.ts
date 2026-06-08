/** カラム定義 */
export type Column = {
  /** カラム名 */
  name: string;
  /** 表示順序 */
  order: number;
  /** `#rrggbb` 形式のアクセント色。不正・欠落時は省略され、表示層がフォールバックパレットを適用する */
  color?: string;
};

/** プロジェクト設定 */
export type ProjectConfig = {
  /** スキーマバージョン */
  version: number;
  /** カラム定義の配列 */
  columns: Column[];
  /** カラムごとのカード表示順（カラム名 → ファイルパスの配列） */
  cardOrder: Record<string, string[]>;
  /** 完了として扱うカラム名 */
  doneColumn: string;
};
