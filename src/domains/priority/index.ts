/** 優先度 */
export type Priority = "High" | "Medium" | "Low";

/** 選択可能な優先度一覧（共有ドメイン companion） */
export const Priority = {
  OPTIONS: ["High", "Medium", "Low"] as const satisfies readonly Priority[],

  /**
   * 任意の文字列を Priority | undefined に正規化する。
   * OPTIONS にない文字列、空文字、undefined はすべて undefined を返す。
   * @param raw - 任意の文字列または undefined
   * @returns 正規化された Priority、または undefined
   */
  parse: (raw: string | undefined): Priority | undefined => {
    if (raw === undefined) return undefined;
    return (Priority.OPTIONS as readonly string[]).includes(raw)
      ? (raw as Priority)
      : undefined;
  },
} as const;
