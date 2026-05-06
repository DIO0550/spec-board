import type { Priority } from "@/domains/priority";
import type { TaskHierarchy } from "@/domains/task-hierarchy";
import type { TaskLinks } from "@/domains/task-links";

/** Tauri IPC から返る flat なタスク payload。 */
export type TaskPayload = {
  /** 一意な識別子 */
  id: string;
  /** タスクタイトル */
  title: string;
  /** ステータス（カラム名に対応） */
  status: string;
  /** 優先度（未設定可） */
  priority?: Priority;
  /** ラベルの配列 */
  labels: string[];
  /** 親タスクのファイルパス（親がない場合は未設定） */
  parent?: string;
  /** 関連タスクのファイルパスの配列 */
  links: string[];
  /** 子タスクのファイルパスの配列（parent から逆引き） */
  children: string[];
  /** 逆方向リンクのファイルパスの配列（links から逆引き） */
  reverseLinks: string[];
  /** Markdown 本文 */
  body: string;
  /** タスクファイルのパス */
  filePath: string;
};

/** タスク */
export type Task = {
  /** 一意な識別子 */
  id: string;
  /** タスクタイトル */
  title: string;
  /** ステータス（カラム名に対応） */
  status: string;
  /** 優先度（未設定可） */
  priority?: Priority;
  /** ラベルの配列 */
  labels: string[];
  /** Markdown 本文 */
  body: string;
  /** タスクファイルのパス */
  filePath: string;
  /** 関連リンク情報 */
  links: TaskLinks;
  /** 親子階層情報 */
  hierarchy: TaskHierarchy;
};

export const Task = {
  /**
   * Tauri IPC の flat payload を frontend domain の Task に変換する。
   *
   * @param payload Tauri IPC から返る task payload
   * @returns frontend domain の task
   */
  fromPayload: (payload: TaskPayload): Task => ({
    id: payload.id,
    title: payload.title,
    status: payload.status,
    priority: payload.priority,
    labels: payload.labels,
    body: payload.body,
    filePath: payload.filePath,
    links: {
      linkedFilePaths: payload.links,
      reverseLinkedFilePaths: payload.reverseLinks,
    },
    hierarchy: {
      parentFilePath: payload.parent,
      childFilePaths: payload.children,
    },
  }),
} as const;
