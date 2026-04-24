/** LabelsField が保持する値の型 */
export type LabelsField = {
  /** 確定済みラベル一覧 */
  labels: string[];
  /** 入力中の未コミット文字列 */
  labelInput: string;
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
   * 入力中文字列を設定する。
   * @param state - 現在の状態
   * @param value - 新しい入力値
   * @returns 新しい状態
   */
  setInput: (state: LabelsField, value: string): LabelsField => ({
    ...state,
    labelInput: value,
  }),

  /**
   * 入力中文字列を labels に取り込む。trim 後空または重複なら labels は不変。
   * @param state - 現在の状態
   * @returns 新しい状態
   */
  commit: (state: LabelsField): LabelsField => {
    const trimmed = state.labelInput.trim();
    if (trimmed.length === 0) return state;
    if (state.labels.includes(trimmed)) return { ...state, labelInput: "" };
    return { labels: [...state.labels, trimmed], labelInput: "" };
  },

  /**
   * 指定ラベルを labels から除外する。
   * @param state - 現在の状態
   * @param label - 削除対象ラベル
   * @returns 新しい状態
   */
  remove: (state: LabelsField, label: string): LabelsField => ({
    ...state,
    labels: state.labels.filter((l) => l !== label),
  }),

  /**
   * submit 用に pending labelInput を取り込んだ最終 labels を同期で返す。
   * @param state - 現在の状態
   * @returns 最終 labels 配列
   */
  finalize: (state: LabelsField): string[] => LabelsField.commit(state).labels,
};
