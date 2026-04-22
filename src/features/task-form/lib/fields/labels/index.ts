/** LabelsField が保持する値の型 */
export type LabelsValue = {
  /** 確定済みラベル一覧 */
  labels: string[];
  /** 入力中の未コミット文字列 */
  labelInput: string;
};

/** LabelsField に対する操作 */
export type LabelsAction =
  | { type: "setInput"; value: string }
  | { type: "commit" }
  | { type: "remove"; label: string };

/**
 * ラベル入力 field の companion object。
 * 初期値・reducer・submit 時の未コミット取り込みを pure function として提供する。
 */
export const LabelsField = {
  /**
   * 初期値を返す。
   * @param initialLabels - 初期ラベル配列（省略時は空配列）
   * @returns 初期状態
   */
  initial: (initialLabels: string[] = []): LabelsValue => ({
    labels: [...initialLabels],
    labelInput: "",
  }),

  /**
   * ラベル入力の状態遷移を計算する純粋 reducer。
   * @param state - 現在の状態
   * @param action - 操作
   * @returns 新しい状態
   */
  reducer: (state: LabelsValue, action: LabelsAction): LabelsValue => {
    switch (action.type) {
      case "setInput":
        return { ...state, labelInput: action.value };
      case "commit": {
        const trimmed = state.labelInput.trim();
        if (trimmed.length === 0) return state;
        if (state.labels.includes(trimmed)) return { ...state, labelInput: "" };
        return { labels: [...state.labels, trimmed], labelInput: "" };
      }
      case "remove":
        return {
          ...state,
          labels: state.labels.filter((l) => l !== action.label),
        };
    }
  },

  /**
   * submit 時に未コミットラベルを取り込み、次状態と最終 labels を同期取得する。
   * @param state - 現在の状態
   * @returns 次状態と最終 labels
   */
  commitPendingAndExtract: (
    state: LabelsValue,
  ): { next: LabelsValue; labels: string[] } => {
    const next = LabelsField.reducer(state, { type: "commit" });
    return { next, labels: next.labels };
  },
};
