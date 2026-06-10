import type { Priority } from "@/domains/priority";

/** TaskForm から送信される値 */
export type TaskFormValues = {
  /** タイトル（必須、空文字不可） */
  title: string;
  /** ファイル名（`.md` 付き完全名・任意。未指定ならタイトル由来で BE が自動生成） */
  fileName?: string;
  /** ステータス（必須） */
  status: string;
  /** 優先度（任意） */
  priority?: Priority;
  /** ラベル一覧 */
  labels: string[];
  /** 親タスクのファイルパス（任意） */
  parent?: string;
  /** 関連タスク（links）のファイルパス一覧 */
  links: string[];
  /** 本文（Markdown） */
  body: string;
  /** 期限 `YYYY-MM-DD`（任意。未指定は due キーを出力しない） */
  due?: string;
  /** サブIssue タイトル（正規化済み。trim 済み・空行なし。空配列 = サブIssue なし） */
  subIssueTitles: string[];
};
