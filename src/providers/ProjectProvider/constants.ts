import type { Column } from "@/types/column";
import type { Task } from "@/types/task";

/**
 * project switchをユーザーへ表示するmessage文字列。
 * 処理分岐にはmessageではなくProjectErrorのreasonを使う。
 */
export const PROJECT_SWITCHED_MESSAGE = "プロジェクトが切り替わりました";

/**
 * 未 loaded 時に渡す空 tasks。呼び出しごとに `?? []` を書くと毎 render で
 * 新しい参照になり、tasks 参照をトリガにしている projection 同期 effect が
 * 無限に発火するため、module スコープの固定参照を使う。
 */
export const EMPTY_TASKS: readonly Task[] = [];

/** 未 loaded 時に渡す空 columns。固定参照が必要な理由は {@link EMPTY_TASKS} と同じ。 */
export const EMPTY_COLUMNS: readonly Column[] = [];
