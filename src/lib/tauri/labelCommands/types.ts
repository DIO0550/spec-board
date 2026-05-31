/** ラベルマスタ定義 1 件。`name` のみ必須、他は任意。 */
export type LabelDefinition = {
  /** ラベル識別子（完全一致・未正規化） */
  name: string;
  /** ラベルの説明文 */
  description?: string;
  /** UI グルーピング用のグループ名 */
  group?: string;
  /** `#RRGGBB` 形式の色。不正・欠落時は省略され、既定色は表示層が適用する */
  color?: string;
  /** 最終更新日時（ISO 8601 推奨・文字列のまま保持） */
  updated?: string;
};

/** get_labels 戻り値ペイロード。`labels` は labels.yml の定義順を保持する。 */
export type GetLabelsPayload = {
  /** ラベル定義の配列（定義順） */
  labels: LabelDefinition[];
};
