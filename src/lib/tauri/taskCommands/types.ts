import type { Priority } from "@/domains/priority";
import type { Task, TaskPayload } from "@/types/task";

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
};

/** open_project が Tauri IPC から返す raw payload。 */
export type OpenProjectRawPayload = {
  /** プロジェクト内の flat task payload 一覧 */
  tasks: TaskPayload[];
  /** カラム名一覧 */
  columns: string[];
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
