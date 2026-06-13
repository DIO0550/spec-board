/** LabelsField が保持する値の型 */
export type LabelsField = {
  /** 確定済みラベル一覧 */
  labels: string[];
  /** 入力中の未コミット文字列 */
  labelInput: string;
};

/**
 * 指定の生文字列を labels に取り込む共通規則。
 * trim 後空なら field 不変、重複なら labelInput だけクリア、新規なら追加 + クリア。
 * `commit`（labelInput の取り込み）と `commitValue`（サジェスト確定値の取り込み）で共有する。
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

  /**
   * サジェスト候補を返す。確定済みラベルを除外し、入力中文字列で
   * 大文字小文字を無視した部分一致絞り込みを行う（入力が空なら全件）。
   * @param field - 現在の field
   * @param candidates - ラベルマスタ由来の候補名一覧
   * @returns サジェストに表示する候補
   */
  suggestionsFor: (
    field: LabelsField,
    candidates: readonly string[],
  ): string[] => {
    const query = field.labelInput.trim().toLowerCase();
    return candidates.filter((name) => {
      if (field.labels.includes(name)) {
        return false;
      }
      if (query === "") {
        return true;
      }
      return name.toLowerCase().includes(query);
    });
  },

  /**
   * サジェスト選択値を labels に取り込む。trim 後空・重複は commit と
   * 同じ規則でスキップし、labelInput はクリアする。
   * @param field - 現在の field
   * @param value - 確定するラベル名
   * @returns 新しい field
   */
  commitValue: (field: LabelsField, value: string): LabelsField =>
    takeIn(field, value),
};
