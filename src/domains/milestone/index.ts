/** マイルストーンの開閉状態。`open` / `closed` 以外の未知値も保持する。 */
export type MilestoneState = "open" | "closed" | (string & {});

/** マイルストーンマスタ定義 1 件。`name` のみ必須、他は任意。 */
export type MilestoneDefinition = {
  /** マイルストーン識別子（完全一致・未正規化）。frontmatter `milestone` から参照される */
  name: string;
  /** 人間可読な表示名。未指定時は表示層が name をフォールバックする */
  title?: string;
  /** マイルストーンの説明文 */
  description?: string;
  /** 期日（ISO 8601 推奨・文字列のまま保持） */
  due?: string;
  /** 表示順序（昇順・非負整数） */
  order?: number;
  /** 開閉状態（open / closed 等。未知値も保持） */
  state?: MilestoneState;
  /** 最終更新日時（ISO 8601 推奨・文字列のまま保持） */
  updated?: string;
};

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

  /**
   * マイルストーンを表示順に並べ替える。
   * order 昇順を基本とし、order 未指定は末尾へ送る。order 同値・両方未指定の場合は
   * 元の定義順を保つ（安定ソート）。
   * @param milestones - マイルストーン定義の配列（定義順）
   * @returns 並べ替え済みの新しい配列
   */
  sortByOrder: (
    milestones: readonly MilestoneDefinition[],
  ): MilestoneDefinition[] =>
    milestones
      .map((m, index) => ({ m, index }))
      .sort((a, b) => {
        const ao = a.m.order;
        const bo = b.m.order;
        if (ao === undefined && bo === undefined) {
          return a.index - b.index;
        }
        if (ao === undefined) {
          return 1;
        }
        if (bo === undefined) {
          return -1;
        }
        return ao === bo ? a.index - b.index : ao - bo;
      })
      .map((entry) => entry.m),
} as const;
