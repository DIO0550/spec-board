/** LinksField が保持する値の型 */
export type LinksField = {
  /** 選択済み関連タスクの filePath 一覧 */
  links: string[];
};

/**
 * 関連タスク（links）入力 field の companion object。
 * ドメインとしての純粋な状態遷移操作のみを提供する。
 * 入力はフリーテキストではなく既存タスクからの filePath 選択である点が
 * LabelsField と異なり、pending 入力文字列を持たない。
 */
export const LinksField = {
  /**
   * 初期値を返す。
   * @param initialLinks - 初期 links 配列（省略時は空配列）
   * @returns 初期状態
   */
  empty: (initialLinks: string[] = []): LinksField => ({
    links: [...initialLinks],
  }),

  /**
   * filePath を links に追加する。空文字または既存重複なら field は不変（dedup）。
   * @param field - 現在の field
   * @param filePath - 追加する関連タスクの filePath
   * @returns 新しい field
   */
  add: (field: LinksField, filePath: string): LinksField => {
    if (filePath.length === 0) {
      return field;
    }
    if (field.links.includes(filePath)) {
      return field;
    }
    return { links: [...field.links, filePath] };
  },

  /**
   * 指定 filePath を links から除外する。
   * @param field - 現在の field
   * @param filePath - 削除対象の filePath
   * @returns 新しい field
   */
  remove: (field: LinksField, filePath: string): LinksField => ({
    links: field.links.filter((link) => link !== filePath),
  }),

  /**
   * submit 用に最終 links を同期で返す。
   * ピッカーは即時 commit のため pending 取り込みは無く現 state をそのまま返す。
   * @param field - 現在の field
   * @returns 最終 links 配列
   */
  finalize: (field: LinksField): string[] => field.links,
};
