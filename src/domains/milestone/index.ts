import type { MilestoneDefinition, MilestoneState } from "@/lib/tauri";

/** マイルストーンの表示・参照に使う共有ドメイン companion。 */
export const Milestone = {
  /**
   * 任意の state 文字列を表示用の既知状態へ正規化する。
   * `closed` のみ closed とし、未知値 / undefined / その他は open 相当へフォールバックする。
   * @param raw - milestones.yml 由来の state 文字列または undefined
   * @returns 表示用に正規化された MilestoneState（"open" | "closed"）
   */
  parseState: (raw: string | undefined): MilestoneState =>
    raw === "closed" ? "closed" : "open",

  /**
   * バッジに表示するラベルを返す。title があれば優先し、無ければ name をフォールバックする。
   * マスタ未定義（definition が undefined）の場合も name をそのまま返す。
   * @param name - frontmatter の milestone 値
   * @param definition - 対応するマスタ定義（未定義なら undefined）
   * @returns 表示ラベル
   */
  badgeLabel: (
    name: string,
    definition: MilestoneDefinition | undefined,
  ): string => {
    const title = definition?.title;
    return title !== undefined && title.length > 0 ? title : name;
  },

  /**
   * バッジに付記する期日（due）を返す。未定義なら undefined。
   * @param definition - 対応するマスタ定義（未定義なら undefined）
   * @returns 期日文字列、または undefined
   */
  dueLabel: (definition: MilestoneDefinition | undefined): string | undefined =>
    definition?.due,

  /**
   * マイルストーン定義配列を name キーの Map に変換する。
   * @param milestones - マイルストーン定義の配列
   * @returns name → MilestoneDefinition の Map
   */
  byName: (
    milestones: readonly MilestoneDefinition[],
  ): Map<string, MilestoneDefinition> =>
    new Map(milestones.map((m) => [m.name, m])),
} as const;
