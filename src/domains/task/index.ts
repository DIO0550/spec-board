import { hasAnyBrokenLink } from "@/domains/broken-link";
import { hasParseError } from "@/domains/parse-error";
import type { Priority } from "@/domains/priority";
import type { TaskHierarchy } from "@/domains/task-hierarchy";
import type { TaskLinks } from "@/domains/task-links";
import { normalizeRefPathForLookup } from "@/domains/task-path";
import { basenameOf } from "@/utils/path";

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

/**
 * Tauri IPC 由来の flat 入力（tauri 非依存の構造型）。wire 型 `TaskPayload` は
 * 本型と型 alias で結合する（wire → domain の一方向 import）。
 * extras / warnings は required（Rust IPC は必ず出力する契約）。
 */
export type TaskInput = {
  id: string;
  title: string;
  status: string;
  priority?: Priority;
  milestone?: string;
  due?: string;
  draft?: boolean;
  labels: string[];
  parent?: string;
  links: string[];
  children: string[];
  reverseLinks: string[];
  body: string;
  filePath: string;
  extras: TaskExtras;
  warnings: TaskWarning[];
};

/**
 * `Task.fromPayload` の入力型。テスト fixture 互換のため extras / warnings を
 * optional にする。wire 型 `TaskPayload = TaskInput` は required 契約だが、
 * こちらはその superset として受ける。
 */
export type TaskFromPayloadInput = Omit<TaskInput, "extras" | "warnings"> &
  Partial<Pick<TaskInput, "extras" | "warnings">>;

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

/**
 * basename から末尾 `.md` (case-insensitive) のみ 1 段除去。dotfile (`.foo`) は非対象、
 * 他拡張子 (`.txt` 等) も非対象。
 * @param base basename
 * @returns 拡張子除去済み文字列
 */
const stripMdExtension = (base: string): string => {
  if (base.length <= 3) {
    return base;
  }
  const tail = base.slice(-3).toLowerCase();
  if (tail !== ".md") {
    return base;
  }
  return base.slice(0, -3);
};

/**
 * raw ref を canonical lookup key に変換する。空 / 絶対 / drive prefix は undefined。
 * @param raw 元の raw ref
 * @returns 正規化済みキー、または undefined
 */
const canonicalOf = (raw: string | undefined): string | undefined => {
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return normalizeRefPathForLookup(raw);
};

export const Task = {
  /**
   * Tauri IPC の flat payload を frontend domain の Task に変換する。
   * @param input Tauri IPC 由来の flat payload（extras / warnings は省略可）
   * @returns frontend domain の Task
   */
  fromPayload: (input: TaskFromPayloadInput): Task => ({
    id: input.id,
    title: input.title,
    status: input.status,
    priority: input.priority,
    milestone: input.milestone,
    due: input.due,
    draft: input.draft ?? false,
    labels: input.labels,
    body: input.body,
    filePath: input.filePath,
    extras: input.extras ?? {},
    warnings: input.warnings ?? [],
    links: {
      linkedFilePaths: input.links,
      reverseLinkedFilePaths: input.reverseLinks,
    },
    hierarchy: {
      parentFilePath: input.parent,
      childFilePaths: input.children,
    },
  }),

  /**
   * タスクが完了しているか判定する。
   * @param task 判定対象のタスク
   * @param doneColumn 完了として扱うカラム名（未解決のときは undefined）
   * @returns `status` が `doneColumn` と一致すれば true。`doneColumn` が undefined のときは常に false
   */
  isDone: (task: Task, doneColumn: string | undefined): boolean =>
    doneColumn !== undefined && task.status === doneColumn,

  /**
   * UI に表示するタスク名を返す。
   * fallback: (1) title (非空 trim 後) → (2) filePath basename (.md 除去) → (3) id → (4) "".
   * @param task 対象タスク
   * @returns 表示名
   */
  displayTitle: (task: Task): string => {
    if (task.title.trim().length > 0) {
      return task.title;
    }
    const base = stripMdExtension(basenameOf(task.filePath));
    if (base.length > 0) {
      return base;
    }
    return task.id;
  },

  /**
   * タスクに 1 件でも broken link (parent / links / children / reverseLinks) があるか。
   * @param task 対象タスク
   * @param ctx lookup 用 context。`tasksByPath` の key は `buildTasksByNormalizedPath` の出力
   *            （`normalizeTaskPathForLookup(task.filePath)` で正規化済みの path）を渡す。
   *            raw `filePath` を key にした Map を渡すと、参照側の正規化と一致せず false negative になる。
   * @returns broken link が 1 件以上あれば true
   */
  hasBrokenLinks: (
    task: Task,
    ctx: { tasksByPath: ReadonlyMap<string, Task> },
  ): boolean => hasAnyBrokenLink(task, ctx.tasksByPath),

  /**
   * タスクに 1 件でも「パースエラー」warning があるか。
   * @param task 対象タスク
   * @returns invalid 系コードを 1 つでも含めば true
   */
  hasParseIssues: (task: Task): boolean => hasParseError(task),

  /**
   * タスクに parent 循環 warning があるか。
   * @param task 対象タスク
   * @returns parentCycle コードを含めば true
   */
  hasCycle: (task: Task): boolean =>
    task.warnings.some((w) => w.code === "parentCycle"),

  /**
   * タスクの生 warning 配列を返す（将来 FE 側 warning 合流のためのフック点）。
   * @param task 対象タスク
   * @returns warning 配列
   */
  warnings: (task: Task): readonly TaskWarning[] => task.warnings,

  /**
   * parent の raw 参照値を返す（元の string / undefined を保持）。
   * @param task 対象タスク
   * @returns raw parent ref。未設定なら undefined
   */
  rawParentRef: (task: Task): string | undefined =>
    task.hierarchy.parentFilePath,

  /**
   * parent の canonical 参照キーを返す。invalid ref は undefined。
   * @param task 対象タスク
   * @returns 正規化済み parent ref。未設定 / 絶対 / drive prefix なら undefined
   */
  canonicalParentRef: (task: Task): string | undefined =>
    canonicalOf(task.hierarchy.parentFilePath),

  /**
   * children の raw 参照配列を返す。
   * @param task 対象タスク
   * @returns raw child ref 配列
   */
  rawChildRefs: (task: Task): readonly string[] =>
    task.hierarchy.childFilePaths,

  /**
   * children の canonical 参照配列（invalid ref は除外）を返す。
   * @param task 対象タスク
   * @returns 正規化済み child ref 配列
   */
  canonicalChildRefs: (task: Task): readonly string[] =>
    task.hierarchy.childFilePaths
      .map(canonicalOf)
      .filter((v): v is string => v !== undefined),

  /**
   * links の raw 参照配列を返す。
   * @param task 対象タスク
   * @returns raw linked ref 配列
   */
  rawLinkedRefs: (task: Task): readonly string[] => task.links.linkedFilePaths,

  /**
   * links の canonical 参照配列（invalid ref は除外）を返す。
   * @param task 対象タスク
   * @returns 正規化済み linked ref 配列
   */
  canonicalLinkedRefs: (task: Task): readonly string[] =>
    task.links.linkedFilePaths
      .map(canonicalOf)
      .filter((v): v is string => v !== undefined),

  /**
   * reverseLinks の raw 参照配列を返す。
   * @param task 対象タスク
   * @returns raw reverse linked ref 配列
   */
  rawReverseLinkedRefs: (task: Task): readonly string[] =>
    task.links.reverseLinkedFilePaths,

  /**
   * reverseLinks の canonical 参照配列（invalid ref は除外）を返す。
   * @param task 対象タスク
   * @returns 正規化済み reverse linked ref 配列
   */
  canonicalReverseLinkedRefs: (task: Task): readonly string[] =>
    task.links.reverseLinkedFilePaths
      .map(canonicalOf)
      .filter((v): v is string => v !== undefined),
} as const;
