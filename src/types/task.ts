import type { Priority } from "@/domains/priority";
import type { TaskHierarchy } from "@/domains/task-hierarchy";
import type { TaskLinks } from "@/domains/task-links";

/** タスク */
export type Task = TaskLinks &
  TaskHierarchy & {
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
  };
