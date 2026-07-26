import type { Priority } from "@/domains/priority";
import type { TaskHierarchy } from "@/domains/task-hierarchy";
import type { TaskLinks } from "@/domains/task-links";

/** JSON 互換値。 */
export type TaskExtraValue =
  | null
  | boolean
  | number
  | string
  | TaskExtraValue[]
  | { readonly [key: string]: TaskExtraValue };

/** 定義外 frontmatter の JSON 互換値。 */
export type TaskExtras = Record<string, TaskExtraValue>;

/** Task 生成時に継続可能な問題として返る warning code。 */
export type TaskWarningCode =
  | "missingTitleUsedFileName"
  | "invalidTitleUsedFileName"
  | "missingStatusUsedDefault"
  | "invalidStatusUsedDefault"
  | "invalidParentIgnored"
  | "parentNotFound"
  | "nonStringExtraKeyIgnored"
  | "extraValueNotJsonCompatible"
  | "parentCycle"
  | "invalidDue";

/** Task 生成時に継続可能な問題として返る warning。 */
export type TaskWarning = {
  /** warning の分類コード */
  code: TaskWarningCode;
  /** warning 対象の frontmatter field 名 */
  field?: string;
  /** warning の説明文 */
  message: string;
};

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
  /** マイルストーン参照キー（単数・未設定可） */
  milestone?: string;
  /**
   * 期限（`YYYY-MM-DD` の原文。未設定可）。
   * Rust 側が不正フォーマットも原文保持するため、検証済みの branded `Due` ではなく
   * 生 `string` として持つ（表示時に `Due.format` で検証して弾く）。
   */
  due?: string;
  /** 下書きフラグ（true のときのみ payload に現れる） */
  draft?: boolean;
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
  /** 定義外 frontmatter の JSON 互換値 */
  extras: TaskExtras;
  /** Task 生成を継続できる非致命 warning 一覧 */
  warnings: TaskWarning[];
};

type TaskPayloadInput = Omit<TaskPayload, "extras" | "warnings"> &
  Partial<Pick<TaskPayload, "extras" | "warnings">>;

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
  /** マイルストーン参照キー（単数・未設定可） */
  milestone?: string;
  /**
   * 期限（`YYYY-MM-DD` の原文。未設定可）。
   * 不正フォーマットも原文保持されるため検証済みの branded `Due` ではなく生 `string`。
   */
  due?: string;
  /** 下書きフラグ（payload 省略時は false） */
  draft: boolean;
  /** ラベルの配列 */
  labels: string[];
  /** Markdown 本文 */
  body: string;
  /** タスクファイルのパス */
  filePath: string;
  /** 定義外 frontmatter の JSON 互換値 */
  extras: TaskExtras;
  /** Task 生成を継続できる非致命 warning 一覧 */
  warnings: TaskWarning[];
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
  fromPayload: (payload: TaskPayloadInput): Task => ({
    id: payload.id,
    title: payload.title,
    status: payload.status,
    priority: payload.priority,
    milestone: payload.milestone,
    due: payload.due,
    draft: payload.draft ?? false,
    labels: payload.labels,
    body: payload.body,
    filePath: payload.filePath,
    extras: payload.extras ?? {},
    warnings: payload.warnings ?? [],
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
