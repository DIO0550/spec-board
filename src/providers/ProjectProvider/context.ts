import { createContext, useContext } from "react";
import type { ProjectLoadWarning } from "@/domains/project-load-warning";
import type { WatcherDiagnostic } from "@/domains/watcher-diagnostic";
import type {
  ArchiveTaskParams,
  CreateTaskParams,
  DeleteTaskParams,
  UpdateTaskParams,
} from "@/lib/tauri";
import type { Task, TaskFilePath } from "@/types/task";
import type { Result as ResultT } from "@/utils/result";
import type {
  ColumnsCommand,
  ColumnsCommandBuilder,
} from "./actions/columnsCommand";
import type { MoveTaskCallbacks, MoveTaskParams } from "./actions/moveTask";
import type {
  ReorderColumnsCallbacks,
  ReorderColumnsResult,
} from "./actions/reorderColumns";
import type { ProjectError } from "./errors";
import type { ProjectData } from "./reducer";
import type { ProjectState } from "./state/projectState";

/** column 更新 command / builder の受け口。 */
export type UpdateColumnsInput = ColumnsCommand | ColumnsCommandBuilder;

/** `useProjectState()` が返す値。 */
export type ProjectStateContextValue = {
  /** 現在の project session state。 */
  state: ProjectState;
};

/** session 系 action（openProject / openProjectByPath / reset）。 */
export type ProjectSessionActionsContextValue = {
  /** ディレクトリダイアログを開いて project を読み込む。 */
  openProject: () => Promise<void>;
  /**
   * ダイアログを開かず指定パスの project を直接読み込む。
   * @param path 開くプロジェクトの絶対パス
   */
  openProjectByPath: (path: string) => Promise<void>;
  /** project state を初期状態に戻す。 */
  reset: () => void;
};

/** task 系 action（create / update / delete / move / addLink / removeLink）。 */
export type ProjectTaskActionsContextValue = {
  /**
   * task を作成し、成功時に state へ反映する。
   * @param params 作成パラメータ
   * @returns 作成結果または ProjectError
   */
  createTask: (
    params: CreateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  /**
   * task を更新し、成功時に state へ反映する。
   * @param params 更新パラメータ
   * @returns 更新結果または ProjectError
   */
  updateTask: (
    params: UpdateTaskParams,
  ) => Promise<ResultT<Task, ProjectError>>;
  /**
   * task を削除し、成功時に state へ反映する。
   * @param params 削除パラメータ
   * @returns 成否を表す Result または ProjectError
   */
  deleteTask: (
    params: DeleteTaskParams,
  ) => Promise<ResultT<void, ProjectError>>;
  /**
   * task を `.spec-board/archive/` へアーカイブし、成功時に state へ反映する。
   * @param params アーカイブパラメータ
   * @returns 成否を表す Result または ProjectError
   */
  archiveTask: (
    params: ArchiveTaskParams,
  ) => Promise<ResultT<void, ProjectError>>;
  /**
   * task のカラム間移動 / カラム内並び替えを単一 entry point で受け付ける。
   * @param params 移動パラメータ
   * @param callbacks 楽観 / rollback の通知 callback（省略可）
   * @returns 成否を表す Result または ProjectError
   */
  moveTask: (
    params: MoveTaskParams,
    callbacks?: MoveTaskCallbacks,
  ) => Promise<ResultT<void, ProjectError>>;
  /**
   * source タスクから target タスクへの link を追加する。
   * @param params link 元 / 先 filePath
   * @returns 更新後の source Task または ProjectError
   */
  addLink: (params: {
    filePath: TaskFilePath;
    targetFilePath: TaskFilePath;
  }) => Promise<ResultT<Task, ProjectError>>;
  /**
   * source タスクから target タスクへの link を削除する。
   * @param params link 元 / 先 filePath
   * @returns 更新後の source Task または ProjectError
   */
  removeLink: (params: {
    filePath: TaskFilePath;
    targetFilePath: string;
  }) => Promise<ResultT<Task, ProjectError>>;
};

/** column 系 action（updateColumns / reorderColumns）。 */
export type ProjectColumnActionsContextValue = {
  /**
   * column 構成を更新する command または builder を解決して反映する。
   * @param command 静的な column 更新命令、または最新 ProjectData から命令を作る builder
   * @returns invoke したかどうかを含む Result または ProjectError
   */
  updateColumns: (
    command: UpdateColumnsInput,
  ) => Promise<ResultT<{ applied: boolean }, ProjectError>>;
  /**
   * カラムを並び替えて全カラムの order を 0-origin で再採番する。
   * @param fromColumnName 移動元カラム名
   * @param toColumnName 移動先カラム名
   * @param callbacks 楽観 / rollback の通知 callback（省略可）
   * @returns invoke / dispatch まで進んだかを表す Result
   */
  reorderColumns: (
    fromColumnName: string,
    toColumnName: string,
    callbacks?: ReorderColumnsCallbacks,
  ) => Promise<ResultT<ReorderColumnsResult, ProjectError>>;
};

/**
 * ProjectProvider が公開するドメインイベント。state 遷移とは独立に、
 * open の「帰結」を購読者へ 1 回だけ配信する（replay しない）。
 */
export type ProjectEvent =
  | { type: "loaded"; path: string; data: ProjectData }
  | { type: "open-error"; error: ProjectError }
  | {
      type: "load-warnings-updated";
      path: string;
      warnings: ProjectLoadWarning[];
    }
  // watcher backend の障害 / full rescan 失敗。state には保持せず通知だけ行う
  // （監視が壊れたことを利用者へ伝えるのが目的で、UI 状態は持たない）。
  // 型は `@/domains/watcher-diagnostic` が所有する（Provider の外へ出る契約なので
  // `WatcherSession` と同じ基準で domain に置く）。
  | ({ type: "watcher-diagnostic" } & WatcherDiagnostic);

/** `useProjectEvents()` が返す値。 */
export type ProjectEventsContextValue = {
  /**
   * ドメインイベントの購読を登録する。
   * @param listener イベント受信 callback
   * @returns 購読解除関数
   */
  subscribe: (listener: (event: ProjectEvent) => void) => () => void;
};

// Provider 未提供時を null で表現し、フック側で early throw する規約に揃える。
export const ProjectStateContext =
  createContext<ProjectStateContextValue | null>(null);
export const ProjectSessionActionsContext =
  createContext<ProjectSessionActionsContextValue | null>(null);
export const ProjectTaskActionsContext =
  createContext<ProjectTaskActionsContextValue | null>(null);
export const ProjectColumnActionsContext =
  createContext<ProjectColumnActionsContextValue | null>(null);
export const ProjectEventsContext =
  createContext<ProjectEventsContextValue | null>(null);

/**
 * 現在の project session state を取得する。
 * @throws ProjectProvider の外で呼ばれた場合
 * @returns {@link ProjectStateContextValue}
 */
export const useProjectState = (): ProjectStateContextValue => {
  const context = useContext(ProjectStateContext);
  if (context === null) {
    throw new Error(
      "useProjectState は ProjectProvider の内側で使用してください",
    );
  }
  return context;
};

/**
 * session 系 action を取得する。
 * @throws ProjectProvider の外で呼ばれた場合
 * @returns {@link ProjectSessionActionsContextValue}
 */
export const useProjectSessionActions =
  (): ProjectSessionActionsContextValue => {
    const context = useContext(ProjectSessionActionsContext);
    if (context === null) {
      throw new Error(
        "useProjectSessionActions は ProjectProvider の内側で使用してください",
      );
    }
    return context;
  };

/**
 * task 系 action を取得する。
 * @throws ProjectProvider の外で呼ばれた場合
 * @returns {@link ProjectTaskActionsContextValue}
 */
export const useProjectTaskActions = (): ProjectTaskActionsContextValue => {
  const context = useContext(ProjectTaskActionsContext);
  if (context === null) {
    throw new Error(
      "useProjectTaskActions は ProjectProvider の内側で使用してください",
    );
  }
  return context;
};

/**
 * column 系 action を取得する。
 * @throws ProjectProvider の外で呼ばれた場合
 * @returns {@link ProjectColumnActionsContextValue}
 */
export const useProjectColumnActions = (): ProjectColumnActionsContextValue => {
  const context = useContext(ProjectColumnActionsContext);
  if (context === null) {
    throw new Error(
      "useProjectColumnActions は ProjectProvider の内側で使用してください",
    );
  }
  return context;
};

/**
 * ドメインイベントの購読 API を取得する。
 * @throws ProjectProvider の外で呼ばれた場合
 * @returns {@link ProjectEventsContextValue}
 */
export const useProjectEvents = (): ProjectEventsContextValue => {
  const context = useContext(ProjectEventsContext);
  if (context === null) {
    throw new Error(
      "useProjectEvents は ProjectProvider の内側で使用してください",
    );
  }
  return context;
};
