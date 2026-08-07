import type {
  MilestoneProjectionMap,
  MilestoneProjectionsPayloadInput,
} from "@/domains/milestone-projection";
import type { Priority } from "@/domains/priority";
import type {
  ProjectLoadWarning,
  ProjectLoadWarningPayloadInput,
} from "@/domains/project-load-warning";
import type { TaskForest, TaskForestPayloadInput } from "@/domains/task-forest";
import type {
  TaskProjectionMap,
  TaskProjectionPayloadInput,
  TaskProjectionsPayloadInput,
} from "@/domains/task-projection";
import type {
  WatcherSession,
  WatcherSessionPayloadInput,
} from "@/domains/watcher-session";
import type { Column } from "@/types/column";
import type { Task, TaskPayload } from "@/types/task";

/**
 * 1 タスク分の projection の raw payload。
 * 実体は domain 側の入力型（循環依存を避けるため型の所有権は domain に置く）。
 */
export type TaskProjectionPayload = TaskProjectionPayloadInput;

/** filePath をキーにした projection の raw payload。 */
export type TaskProjectionsPayload = TaskProjectionsPayloadInput;

/**
 * 階層ツリーの raw payload。
 * 実体は domain 側の入力型（循環依存を避けるため型の所有権は domain に置く）。
 */
export type TaskForestPayload = TaskForestPayloadInput;

/**
 * watcher session の raw payload。
 * 実体は domain 側の入力型（循環依存を避けるため型の所有権は domain に置く）。
 */
export type WatcherSessionPayload = WatcherSessionPayloadInput;

/** open_project 引数。 */
export type OpenProjectParams = {
  /** プロジェクトディレクトリの絶対パス */
  path: string;
};

/** open_project 戻り値ペイロード（BE 仕様準拠）。 */
export type OpenProjectPayload = {
  /** プロジェクト内のタスク一覧 */
  tasks: Task[];
  /** カラム名一覧 */
  columns: string[];
  /** filePath -> projection */
  projections: TaskProjectionMap;
  /** milestone 名 -> live progress / board-order task paths */
  milestoneProjections: MilestoneProjectionMap;
  /** 親子階層のネストツリー（全タスクの正準ツリー。絞り込みは FE 側で行う） */
  taskTree: TaskForest;
  /** プロジェクト読み込み中に継続可能だった警告 */
  loadWarnings: ProjectLoadWarning[];
  /** watcher event 検証の初期 baseline（tasks と同一トランザクションの値） */
  session: WatcherSession;
};

/** open_project が Tauri IPC から返す raw payload。 */
export type OpenProjectRawPayload = {
  /** プロジェクト内の flat task payload 一覧 */
  tasks: TaskPayload[];
  /** カラム名一覧 */
  columns: string[];
  /** filePath をキーにした projection の raw payload */
  projections: TaskProjectionsPayload;
  /** milestone 名をキーにした projection の raw payload */
  milestoneProjections: MilestoneProjectionsPayloadInput;
  /** 階層ツリーの raw payload */
  taskTree: TaskForestPayload;
  /** プロジェクト読み込み中に継続可能だった警告 */
  loadWarnings: ProjectLoadWarningPayloadInput[];
  /** watcher session の raw payload */
  session: WatcherSessionPayload;
};

/** get_tasks 戻り値ペイロード。 */
export type GetTasksPayload = {
  /**
   * プロジェクト内のタスク一覧。`openProject` と同じ board 表示順
   * （カラム表示順 → カラム内 cardOrder → id 昇順）で返る。
   * board は配列順をそのまま表示順に使うため、watcher の再取得で並びが崩れない。
   */
  tasks: Task[];
  /**
   * board 表示順のカラム定義。`tasks` と同一 snapshot の config 由来。
   *
   * 別コマンドで取り直すと、間に走った backend の commit をまたいで
   * 「tasks は旧 revision・columns は新 revision」が混在しうる。
   */
  columns: Column[];
  /** 解決済みの完了カラム。プロジェクト未 open では undefined */
  doneColumn?: string;
  /** filePath -> projection */
  projections: TaskProjectionMap;
  /** milestone 名 -> live progress / board-order task paths */
  milestoneProjections: MilestoneProjectionMap;
  /** 親子階層のネストツリー（全タスクの正準ツリー。絞り込みは FE 側で行う） */
  taskTree: TaskForest;
  /** プロジェクト読み込み中に継続可能だった警告 */
  loadWarnings: ProjectLoadWarning[];
  /** この snapshot の watcher session（envelope 検証の baseline 再設定用） */
  session: WatcherSession;
};

/** get_tasks が Tauri IPC から返す raw payload。 */
export type GetTasksRawPayload = {
  /** プロジェクト内の flat task payload 一覧 */
  tasks: TaskPayload[];
  /** board 表示順のカラム定義 */
  columns: Column[];
  /** 解決済みの完了カラム。プロジェクト未 open では null */
  doneColumn: string | null;
  /** filePath をキーにした projection の raw payload */
  projections: TaskProjectionsPayload;
  /** milestone 名をキーにした projection の raw payload */
  milestoneProjections: MilestoneProjectionsPayloadInput;
  /** 階層ツリーの raw payload */
  taskTree: TaskForestPayload;
  /** プロジェクト読み込み中に継続可能だった警告 */
  loadWarnings: ProjectLoadWarningPayloadInput[];
  /** watcher session の raw payload */
  session: WatcherSessionPayload;
};

/** create_task 引数（title / status は必須、その他は任意）。 */
export type CreateTaskParams = {
  /** タスクタイトル */
  title: string;
  /** ステータス（カラム名） */
  status: string;
  /** 優先度（任意） */
  priority?: Priority;
  /** マイルストーン参照キー（任意・単数。空文字/未指定は未割当） */
  milestone?: string;
  /** ラベル一覧（任意） */
  labels?: string[];
  /** 親タスクのファイルパス（任意） */
  parent?: string;
  /** 関連タスク（links）のファイルパス一覧（任意） */
  links?: string[];
  /** Markdown 本文（任意） */
  body?: string;
  /** 明示ファイル名（`.md` 付き完全名・任意。重複時は BE が連番付与） */
  fileName?: string;
  /** 期限 `YYYY-MM-DD`（任意。未指定/空は due キーを出力しない） */
  due?: string;
  /** 下書きフラグ（任意。true のときのみ frontmatter に draft: true を出力） */
  draft?: boolean;
};

/** update_task 引数（filePath 必須、それ以外は任意の部分更新）。 */
export type UpdateTaskParams = {
  /** 更新対象タスクのファイルパス */
  filePath: string;
  /** タスクタイトル（任意） */
  title?: string;
  /** ステータス（任意） */
  status?: string;
  /** 優先度（任意） */
  priority?: Priority;
  /** マイルストーン参照キー（任意・3 値: undefined=不変 / ""=クリア / name=設定） */
  milestone?: string;
  /** ラベル一覧（任意） */
  labels?: string[];
  /** 親タスクのファイルパス（任意。空文字で親解除） */
  parent?: string;
  /** Markdown 本文（任意） */
  body?: string;
  /** draft の更新意図（3 値: undefined=不変 / true=draft 化 / false=解除） */
  draft?: boolean;
};

/** move_task 引数（カラム間移動と同一カラム並び替えの両方で使う）。 */
export type MoveTaskParams = {
  /** 移動対象タスクのファイルパス */
  readonly filePath: string;
  /** 移動元カラム名（BE 側で現在の status と一致するか検証される） */
  readonly fromColumn: string;
  /** 移動先カラム名（同一カラム並び替えでは fromColumn と同値） */
  readonly toColumn: string;
  /** 移動先カラムの新しい並び順（タスクファイルパスの配列。先頭が最上位） */
  readonly toColumnFilePaths: readonly string[];
  /** 移動先カラムが移動前にこうであったはず、という並び。BE が現実と照合する。 */
  readonly expectedToColumnOrder: readonly string[];
};

/** preview_task_markdown 引数。Task entity や fileName を含めない明示的な draft DTO。 */
export type PreviewTaskMarkdownParams = {
  title: string;
  status: string;
  priority?: string;
  labels: string[];
  parent?: string;
  links: string[];
  due?: string;
  draft: boolean;
  body: string;
};

/** preview_task_filename 引数。 */
export type PreviewTaskFilenameParams = {
  /** タスクタイトル */
  title: string;
  /** 明示ファイル名（任意） */
  explicitFilename?: string;
  /** 親タスクのファイルパス（任意） */
  parentFilePath?: string;
};

/** preview_task_filename の戻り値。tagged union (kind で分岐)。 */
export type PreviewTaskFilenamePayload =
  | { kind: "path"; fileName: string; relPath: string; fullPath: string }
  | { kind: "invalid"; error: string }
  | { kind: "pending" };

/** 子タスクが存在する場合の処理方針。 */
export type OrphanStrategy = "clear" | "abort";

/** delete_task 引数。 */
export type DeleteTaskParams = {
  /** 削除対象タスクのファイルパス */
  filePath: string;
  /** 子タスクへの方針（任意） */
  orphanStrategy?: OrphanStrategy;
};
