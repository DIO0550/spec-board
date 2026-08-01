import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { ProjectLoadWarning } from "@/domains/project-load-warning";
import type { WatcherDiagnostic } from "@/domains/watcher-diagnostic";
import { addLinkAction } from "./actions/addLink";
import type {
  DialogOpening,
  OpenProjectActionDeps,
  TaskActionDeps,
} from "./actions/deps";
import { moveTaskAction } from "./actions/moveTask";
import { openProjectAction } from "./actions/openProject";
import { removeLinkAction } from "./actions/removeLink";
import { reorderColumnsAction } from "./actions/reorderColumns";
import {
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "./actions/tasks";
import { updateColumnsAction } from "./actions/updateColumns";
import {
  createProjectVersion,
  invalidateOpenRequests,
  invalidateProject,
  type ProjectCommandQueue,
} from "./concurrency";
import { EMPTY_COLUMNS, EMPTY_TASKS } from "./constants";
import {
  ProjectColumnActionsContext,
  type ProjectColumnActionsContextValue,
  type ProjectEvent,
  ProjectEventsContext,
  type ProjectEventsContextValue,
  ProjectSessionActionsContext,
  type ProjectSessionActionsContextValue,
  ProjectStateContext,
  type ProjectStateContextValue,
  ProjectTaskActionsContext,
  type ProjectTaskActionsContextValue,
} from "./context";
import { createProjectStore, type ProjectStore } from "./store";
import {
  type SyncedMarker,
  useProjectionSyncEffect,
} from "./useProjectionSyncEffect";
import {
  useTaskWatcherEffects,
  type WatcherGateRef,
} from "./useTaskWatcherEffects";
import { useWatcherResyncEffect } from "./useWatcherResyncEffect";
import { WatcherGate, type WatcherGateState } from "./watcherEnvelopeGate";

export { PROJECT_SWITCHED_MESSAGE } from "./constants";
export type {
  ProjectColumnActionsContextValue,
  ProjectEvent,
  ProjectEventsContextValue,
  ProjectSessionActionsContextValue,
  ProjectStateContextValue,
  ProjectTaskActionsContextValue,
  UpdateColumnsInput,
} from "./context";
export {
  useProjectColumnActions,
  useProjectEvents,
  useProjectSessionActions,
  useProjectState,
  useProjectTaskActions,
} from "./context";
export { ProjectError } from "./errors";
export { wasNotifiedByInvokeWrapped } from "./notifiedByInvokeWrapped";
export { projectErrorMessage } from "./projectErrorMessage";
export type { ProjectData } from "./reducer";
export type { ProjectState } from "./state/projectState";
export type {
  ColumnsCommand,
  ColumnsCommandBuilder,
  MoveTaskCallbacks,
  MoveTaskParams,
  ProjectLoadedEvent,
  ReorderColumnsCallbacks,
  ReorderColumnsEvent,
  ReorderColumnsParams,
  ReorderColumnsResult,
} from "./types";

/** ProjectProvider の Props。 */
type ProjectProviderProps = {
  /** Context を供給する子要素。 */
  children: ReactNode;
};

/**
 * project session state（外部 store 保持 + `useSyncExternalStore` 購読）と、
 * Session / Task / Column の 3 系統 action、ドメインイベント購読 API を Context で
 * 供給する Provider。通知（toast / recentProjects）には一切依存せず、open の帰結は
 * `ProjectEvent` として emit するだけに留める（購読は ProjectNotificationsProvider）。
 *
 * @param props - {@link ProjectProviderProps}
 * @returns Provider 要素
 */
export const ProjectProvider = ({ children }: ProjectProviderProps) => {
  // state 本体は React 外の store が保持する（真実は 1 箇所のみ）。lazy init で 1 度だけ生成。
  const storeRef = useRef<ProjectStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createProjectStore();
  }
  const store = storeRef.current;

  const state = useSyncExternalStore(store.subscribe, store.getState);

  const projectVersionRef = useRef(createProjectVersion());
  const projectCommandQueueRef = useRef<ProjectCommandQueue>({
    current: Promise.resolve(),
  });
  const dialogOpeningRef = useRef<DialogOpening>({ current: false });

  // ドメインイベント基盤（state store とは別物）。emit / subscribe は恒久 stable。
  const listenersRef = useRef<Set<(event: ProjectEvent) => void>>(new Set());
  const emit = useCallback((event: ProjectEvent): void => {
    listenersRef.current.forEach((listener) => {
      listener(event);
    });
  }, []);
  const subscribeEvents = useCallback(
    (listener: (event: ProjectEvent) => void): (() => void) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  // task / column action の共通 deps を mount 時 1 度だけ生成する。store のメソッドは
  // 恒久 stable なので、この deps は Provider の生涯にわたり不変にできる。
  const taskDepsRef = useRef<TaskActionDeps | null>(null);
  if (taskDepsRef.current === null) {
    taskDepsRef.current = {
      projectVersion: projectVersionRef.current,
      projectCommandQueue: projectCommandQueueRef.current,
      getState: store.getState,
      dispatch: store.dispatch,
    };
  }
  const taskDeps = taskDepsRef.current;

  const loadedPath = state.kind === "loaded" ? state.path : null;

  // watcher envelope の検証状態。ProjectVersion と同様「ref に世代を持ち、受信時に
  // 比較する」既存パターンに揃える（Provider 生涯で参照は不変）。
  const watcherGateRef = useRef<WatcherGateState>(WatcherGate.initial);
  // projection 再同期の marker を Provider が所有し、2 hook で共有する。
  const projectionSyncedRef = useRef<SyncedMarker | null>(null);

  const watcherSession =
    state.kind === "loaded" ? state.data.watcherSession : null;

  const lastLoadWarningsRef = useRef<{
    path: string;
    fingerprint: string;
  } | null>(null);
  const notifyLoadWarnings = useCallback(
    (warnings: ProjectLoadWarning[], path: string): void => {
      const fingerprint = ProjectLoadWarning.fingerprint(warnings);
      const previous = lastLoadWarningsRef.current;
      lastLoadWarningsRef.current = { path, fingerprint };
      if (previous?.path === path && previous.fingerprint === fingerprint) {
        return;
      }
      emit({ type: "load-warnings-updated", path, warnings });
    },
    [emit],
  );

  const requestResync = useWatcherResyncEffect({
    loadedPath,
    gate: watcherGateRef as WatcherGateRef,
    projectCommandQueue: projectCommandQueueRef.current,
    projectionSynced: projectionSyncedRef,
    getState: store.getState,
    dispatch: store.dispatch,
    notifyLoadWarnings,
  });

  const notifyDiagnostic = useCallback(
    (diagnostic: WatcherDiagnostic): void => {
      emit({ type: "watcher-diagnostic", ...diagnostic });
    },
    [emit],
  );

  useTaskWatcherEffects({
    loadedPath,
    session: watcherSession,
    gate: watcherGateRef as WatcherGateRef,
    requestResync,
    notifyDiagnostic,
    getState: store.getState,
    dispatch: store.dispatch,
  });

  // tasks の差分更新 / カラム設定変更で stale になった projection を get_tasks で
  // 再同期する。columns も基準に含める（並び替えでは tasks も doneColumn 文字列も
  // 変わらないが、BE の末尾カラムフォールバックの結果は変わるため）。
  useProjectionSyncEffect({
    loadedPath,
    // open 失敗による旧 project 復元を「新しい open payload」と誤認しないための識別子。
    openRequestId: state.kind === "loaded" ? state.data.openRequestId : null,
    tasks: state.kind === "loaded" ? state.data.tasks : EMPTY_TASKS,
    columns: state.kind === "loaded" ? state.data.columns : EMPTY_COLUMNS,
    doneColumn: state.kind === "loaded" ? state.data.doneColumn : undefined,
    projectCommandQueue: projectCommandQueueRef.current,
    synced: projectionSyncedRef,
    getState: store.getState,
    dispatch: store.dispatch,
    notifyLoadWarnings,
  });

  // unmount 時は世代 bump のみ（active フラグは持たない）。in-flight command / open は
  // 世代不一致で結果が破棄される。
  useEffect(() => {
    return () => {
      invalidateOpenRequests(projectVersionRef.current);
      invalidateProject(projectVersionRef.current);
    };
  }, []);

  const sessionActions = useMemo<ProjectSessionActionsContextValue>(() => {
    const openDeps: OpenProjectActionDeps = {
      projectVersion: projectVersionRef.current,
      projectCommandQueue: projectCommandQueueRef.current,
      dialogOpening: dialogOpeningRef.current,
      dispatch: store.dispatch,
      onLoaded: (event) => {
        emit({ type: "loaded", path: event.path, data: event.data });
        notifyLoadWarnings(event.data.loadWarnings, event.path);
      },
      onError: (error) => {
        emit({ type: "open-error", error });
      },
    };
    return {
      openProject: () => openProjectAction(openDeps),
      openProjectByPath: (path) => openProjectAction({ ...openDeps, path }),
      reset: () => {
        invalidateOpenRequests(projectVersionRef.current);
        invalidateProject(projectVersionRef.current);
        store.dispatch({ type: "reset" });
      },
    };
  }, [store, emit, notifyLoadWarnings]);

  const taskActions = useMemo<ProjectTaskActionsContextValue>(
    () => ({
      createTask: (params) => createTaskAction(taskDeps, params),
      updateTask: (params) => updateTaskAction(taskDeps, params),
      deleteTask: (params) => deleteTaskAction(taskDeps, params),
      moveTask: (params, callbacks) =>
        moveTaskAction(taskDeps, params, callbacks),
      addLink: (params) => addLinkAction(taskDeps, params),
      removeLink: (params) => removeLinkAction(taskDeps, params),
    }),
    [taskDeps],
  );

  const columnActions = useMemo<ProjectColumnActionsContextValue>(
    () => ({
      updateColumns: (command) => updateColumnsAction(taskDeps, command),
      reorderColumns: (fromColumnName, toColumnName, callbacks) =>
        reorderColumnsAction(
          taskDeps,
          { fromColumnName, toColumnName },
          callbacks,
        ),
    }),
    [taskDeps],
  );

  const stateValue = useMemo<ProjectStateContextValue>(
    () => ({ state }),
    [state],
  );
  const eventsValue = useMemo<ProjectEventsContextValue>(
    () => ({ subscribe: subscribeEvents }),
    [subscribeEvents],
  );

  return (
    <ProjectEventsContext.Provider value={eventsValue}>
      <ProjectSessionActionsContext.Provider value={sessionActions}>
        <ProjectTaskActionsContext.Provider value={taskActions}>
          <ProjectColumnActionsContext.Provider value={columnActions}>
            <ProjectStateContext.Provider value={stateValue}>
              {children}
            </ProjectStateContext.Provider>
          </ProjectColumnActionsContext.Provider>
        </ProjectTaskActionsContext.Provider>
      </ProjectSessionActionsContext.Provider>
    </ProjectEventsContext.Provider>
  );
};
