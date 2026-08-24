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

type TaskWarningPayloadInput = Omit<TaskWarning, "field"> & {
  field?: string | null;
};

type TaskPayloadInput = Omit<TaskPayload, "extras" | "warnings"> & {
  extras?: TaskExtras;
  warnings?: TaskWarningPayloadInput[];
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

/** `Task.equals` が比較するキーの列挙（現状 14 キー = `Task` の全フィールド）。 */
export const TASK_COMPARED_KEYS = [
  "id",
  "title",
  "status",
  "priority",
  "milestone",
  "due",
  "draft",
  "labels",
  "body",
  "filePath",
  "extras",
  "warnings",
  "links",
  "hierarchy",
] as const satisfies readonly (keyof Task)[];

/**
 * 網羅の型レベル強制。
 *
 * `satisfies` は「各要素が `keyof Task` である」ことしか見ないため、`Task` に
 * フィールドを足しても列挙漏れを検出できない。差集合が空であることを要求する
 * ことで、**フィールド追加時にこの行がコンパイルエラーになる**。比較漏れは
 * 「resync が変更を黙って捨てる」という本機能が解決すべき症状そのものを
 * 再発させるため、型で止める。
 */
type MissingTaskKey = Exclude<keyof Task, (typeof TASK_COMPARED_KEYS)[number]>;
const _taskKeysExhaustive: MissingTaskKey extends never
  ? true
  : MissingTaskKey = true;
void _taskKeysExhaustive;

/**
 * JSON 互換値を再帰的に比較する。
 * @param left 比較対象
 * @param right 比較対象
 * @returns 構造まで含めて等価なら true
 */
const deepEquals = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepEquals(item, right[index]))
    );
  }
  if (
    typeof left === "object" &&
    typeof right === "object" &&
    left !== null &&
    right !== null
  ) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) =>
        deepEquals(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
      )
    );
  }
  return false;
};

/**
 * IPC warningのlegacy nullをcanonicalなfieldキー省略へ正規化する。
 * @param warning Tauri IPCから受け取ったwarning
 * @returns frontend domainで保持するcanonical warning
 */
const taskWarningFromPayload = ({
  field,
  ...warning
}: TaskWarningPayloadInput): TaskWarning => {
  if (field === null || field === undefined) {
    return warning;
  }
  return { ...warning, field };
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
    warnings: payload.warnings?.map(taskWarningFromPayload) ?? [],
    links: {
      linkedFilePaths: payload.links,
      reverseLinkedFilePaths: payload.reverseLinks,
    },
    hierarchy: {
      parentFilePath: payload.parent,
      childFilePaths: payload.children,
    },
  }),

  /**
   * 2 つの Task が表示上等価かを判定する。
   *
   * 参照据え置きマージ（`ProjectData.resyncTasks`）で「旧参照を引き継いでよいか」
   * を決めるために使う。`TaskProjection.equals` と同じ役割。配列 / オブジェクト
   * フィールド（labels / links / hierarchy / extras / warnings）は要素ごとに
   * 比較する。
   * @param left 比較対象
   * @param right 比較対象
   * @returns 全フィールドが等価なら true
   */
  equals: (left: Task, right: Task): boolean =>
    TASK_COMPARED_KEYS.every((key) => deepEquals(left[key], right[key])),
} as const;
