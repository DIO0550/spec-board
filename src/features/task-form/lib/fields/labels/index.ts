/** LabelsField が保持する値の型 */
export type LabelsField = {
  /** 確定済みラベル一覧 */
  labels: string[];
  /** 入力中の未コミット文字列 */
  labelInput: string;
};

/**
 * 指定の生文字列を labels に取り込む共通規則。
 * trim 後空なら field 不変、既存に完全一致する重複なら labelInput だけクリア、
 * 新規なら trim 済み値を追加して labelInput をクリアする。
 * `commit`（labelInput の取り込み）で使う。
 * @param field - 現在の field
 * @param raw - 取り込む生文字列
 * @returns 新しい field
 */
const takeIn = (field: LabelsField, raw: string): LabelsField => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return field;
  }
  if (field.labels.includes(trimmed)) {
    return { ...field, labelInput: "" };
  }
  return { labels: [...field.labels, trimmed], labelInput: "" };
};

/**
 * ラベル入力 field の companion object。
 * ドメインとしての純粋な状態遷移操作のみを提供する。
 * React の reducer / Dispatch といった実装詳細は hook 層が担う。
 */
export const LabelsField = {
  /**
   * 初期値を返す。
   * @param initialLabels - 初期ラベル配列（省略時は空配列）
   * @returns 初期状態
   */
  initial: (initialLabels: string[] = []): LabelsField => ({
    labels: [...initialLabels],
    labelInput: "",
  }),

  /**
   * 入力中文字列だけを差し替えた新しい field を返す。
   * @param field - 現在の field
   * @param value - 新しい入力値
   * @returns 新しい field
   */
  withInput: (field: LabelsField, value: string): LabelsField => ({
    ...field,
    labelInput: value,
  }),

  /**
   * labels を丸ごと差し替えた新しい field を返す（popover の onChange 用）。
   * 現在の field は参照しない（labels を全置換し labelInput はクリアする）。
   * @param _field - 現在の field（reducer 呼び出しとの対称性のため受けるが未使用）
   * @param labels - 新しいラベル一覧
   * @returns 新しい field（labelInput はクリア）
   */
  withLabels: (_field: LabelsField, labels: string[]): LabelsField => ({
    labels: [...labels],
    labelInput: "",
  }),

  /**
   * 入力中文字列を labels に取り込む。trim 後空または重複なら labels は不変。
   * @param field - 現在の field
   * @returns 新しい field
   */
  commit: (field: LabelsField): LabelsField => takeIn(field, field.labelInput),

  /**
   * 指定ラベルを labels から除外する。
   * @param field - 現在の field
   * @param label - 削除対象ラベル
   * @returns 新しい field
   */
  remove: (field: LabelsField, label: string): LabelsField => ({
    ...field,
    labels: field.labels.filter((l) => l !== label),
  }),

  /**
   * submit 用に pending labelInput を取り込んだ最終 labels を同期で返す。
   * @param field - 現在の field
   * @returns 最終 labels 配列
   */
  finalize: (field: LabelsField): string[] => LabelsField.commit(field).labels,
};
