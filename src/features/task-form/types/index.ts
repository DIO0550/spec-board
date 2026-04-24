import type { Priority } from "@/types/task";

/** TaskForm から送信される値 */
export type TaskFormValues = {
  /** タイトル（必須、空文字不可） */
  title: string;
  /** ステータス（必須） */
  status: string;
  /** 優先度（任意） */
  priority?: Priority;
  /** ラベル一覧 */
  labels: string[];
  /** 親タスクのファイルパス（任意） */
  parent?: string;
  /** 本文（Markdown） */
  body: string;
};
