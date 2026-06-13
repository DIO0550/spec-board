/** dirty 判定に使うフォーム現在値と初期値のスナップショット。 */
export type FormDirtyInput = {
  values: {
    title: string;
    fileName: string;
    status: string;
    due: string;
    priority: string;
    body: string;
    subIssues: string;
    draft: boolean;
    parent?: string;
  };
  /** 確定済みラベル */
  labels: readonly string[];
  /** 入力中の未コミット文字列（非空なら dirty） */
  labelInput: string;
  /** 選択済みリンク */
  links: readonly string[];
  /** ステータス初期値（これと同じなら未変更扱い） */
  initialStatus: string;
  /** 親タスク初期値（未指定は空扱い） */
  initialParent?: string;
};

/**
 * フォームに破棄確認が必要な入力があるかを判定する。
 * 比較項目は「初期値が空のフィールド（非空なら dirty）」と
 * 「初期値を持つフィールド（初期値との不一致で dirty）」の 2 群に分けて列挙する。
 * @param input - フォーム現在値と初期値
 * @returns 1 つでも初期値から変化していれば true
 */
export const isFormDirty = (input: FormDirtyInput): boolean => {
  // 初期値が空のフィールド群: 1 つでも非空なら dirty。
  const emptyInitially = [
    input.values.title,
    input.values.fileName,
    input.values.due,
    input.values.priority,
    input.values.body,
    input.values.subIssues,
    input.labelInput,
  ];
  if (emptyInitially.some((value) => value !== "")) {
    return true;
  }
  if (input.values.draft) {
    return true;
  }
  if (input.labels.length > 0 || input.links.length > 0) {
    return true;
  }
  // 初期値を持つフィールド群: 初期値との不一致で dirty。
  if (input.values.status !== input.initialStatus) {
    return true;
  }
  // parent は未指定（undefined）と空文字を同一視して比較する。
  const parent = input.values.parent ?? "";
  const initialParent = input.initialParent ?? "";
  return parent !== initialParent;
};
