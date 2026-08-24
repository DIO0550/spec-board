import type { MilestoneDefinition, MilestoneState } from "@/domains/milestone";

// ドメイン型を IPC 公開 API としても利用できるよう再公開する（依存方向は lib/tauri → domains）。
export type { MilestoneDefinition, MilestoneState };

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

/**
 * create_milestone 引数。公開wire形状は従来どおり`order?: number`であり、
 * invoke wrapperが0..=u32::MAXの整数だけを送信する。
 */
export type CreateMilestoneArgs = {
  /** マイルストーン識別子（必須） */
  name: string;
  /** 表示名（任意） */
  title?: string;
  /** 説明文（任意） */
  description?: string;
  /** 期日（任意） */
  due?: string;
  /** 表示順序（任意）。指定時は0..=4294967295の整数 */
  order?: number;
  /** 開閉状態（任意） */
  state?: MilestoneState;
};

/**
 * update_milestone 引数。PUT セマンティクス（全フィールドを送る・未指定はクリア）。
 * orderのwire型とinvoke前検証は{@link CreateMilestoneArgs}と共通。
 */
export type UpdateMilestoneArgs = CreateMilestoneArgs;

/** delete_milestone 戻り値ペイロード。削除前の使用タスク件数を返す。 */
export type DeleteMilestonePayload = {
  /** 削除前に算出した使用タスク件数 */
  usageCount: number;
};
