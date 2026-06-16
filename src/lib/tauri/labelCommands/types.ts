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

/**
 * get_labels 戻り値ペイロード。`labels` は labels.yml の定義順を保持する。
 * `usageCounts` を含める（labels で起きた型ドリフトを繰り返さない）。
 */
export type GetLabelsPayload = {
  /** ラベル定義の配列（定義順） */
  labels: LabelDefinition[];
  /** ラベル名 → 使用タスク件数（タスク単位で重複排除） */
  usageCounts: Record<string, number>;
};

/** create_label 引数。BE は空 group → None / 不正 HEX → 既定色 へ lenient 変換する。 */
export type CreateLabelArgs = {
  /** ラベル識別子（必須） */
  name: string;
  /** 説明文（任意） */
  description?: string;
  /** グループ名（任意） */
  group?: string;
  /** `#RRGGBB`。不正・空は送ってよい（BE が既定色へ倒す） */
  color?: string;
};

/** update_label 引数。PUT セマンティクス（name は rename しない・未指定はクリア）。 */
export type UpdateLabelArgs = CreateLabelArgs;

/** delete_label 戻り値ペイロード。削除前の使用タスク件数を返す。 */
export type DeleteLabelPayload = {
  /** 削除前に算出した使用タスク件数 */
  usageCount: number;
};

/** export_labels 引数。保存先パス（ユーザーが save ダイアログで選択する）。 */
export type ExportLabelsArgs = {
  /** labels.yml の書き出し先パス */
  path: string;
};
