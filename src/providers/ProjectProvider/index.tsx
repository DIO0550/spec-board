import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
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
import { useTaskWatcherEffects } from "./useTaskWatcherEffects";

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

  useTaskWatcherEffects({
    loadedPath: state.kind === "loaded" ? state.path : null,
    getState: store.getState,
    dispatch: store.dispatch,
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
  }, [store, emit]);

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
