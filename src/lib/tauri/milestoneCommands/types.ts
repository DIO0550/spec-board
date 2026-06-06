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

/**
 * get_milestones 戻り値ペイロード。`milestones` は milestones.yml の定義順を保持する。
 * `usageCounts` を最初から含める（labels で起きた型ドリフトを繰り返さない）。
 */
export type GetMilestonesPayload = {
  /** マイルストーン定義の配列（定義順） */
  milestones: MilestoneDefinition[];
  /** マイルストーン名 → 使用タスク件数 */
  usageCounts: Record<string, number>;
};

/** create_milestone 引数。 */
export type CreateMilestoneArgs = {
  /** マイルストーン識別子（必須） */
  name: string;
  /** 表示名（任意） */
  title?: string;
  /** 説明文（任意） */
  description?: string;
  /** 期日（任意） */
  due?: string;
  /** 表示順序（任意） */
  order?: number;
  /** 開閉状態（任意） */
  state?: MilestoneState;
};

/** update_milestone 引数。PUT セマンティクス（全フィールドを送る・未指定はクリア）。 */
export type UpdateMilestoneArgs = CreateMilestoneArgs;

/** delete_milestone 戻り値ペイロード。削除前の使用タスク件数を返す。 */
export type DeleteMilestonePayload = {
  /** 削除前に算出した使用タスク件数 */
  usageCount: number;
};
