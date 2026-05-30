import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LiveAnnouncement, LiveRegion } from "@/components/LiveRegion";
import { ToastContainer } from "@/components/ToastContainer";
import {
  buildTasksByNormalizedPath,
  countTasksWithBrokenLink,
} from "@/domains/broken-link";
import { countTasksWithParseError } from "@/domains/parse-error";
import { selectTaskOutcome } from "@/domains/task-selection";
import { useToasts } from "@/hooks/useToasts";
import type { OrphanStrategy } from "@/lib/tauri";
import {
  Board,
  EmptyState,
  HeaderBar,
  type MoveTaskParams,
  PROJECT_SWITCHED_MESSAGE,
  type ProjectState,
  projectErrorMessage,
  type ReorderColumnsEvent,
  useProject,
} from "./features/board";
import { DetailPanel } from "./features/detail";
import {
  TaskCreateModal,
  type TaskFormValues,
  useTaskCreate,
} from "./features/task-form";
import type { Column } from "./types/column";
import type { Task } from "./types/task";

/** State の表示用 ProjectData を返すための内部型。 */
type DisplayableData = {
  readonly tasks: Task[];
  readonly columns: Column[];
  readonly doneColumn?: string;
};

/**
 * 表示可能な ProjectData を返す。
 * - loaded: state.data
 * - それ以外: null
 *
 * @param state useProject の現在 state
 * @returns 表示用 data または null
 */
const displayableDataOf = (state: ProjectState): DisplayableData | null => {
  if (state.kind === "loaded") {
    return state.data;
  }
  return null;
};

/**
 * 表示用 tasks を返す。
 *
 * @param state useProject の現在 state
 * @returns 派生タスク配列
 */
const tasksOf = (state: ProjectState): Task[] =>
  displayableDataOf(state)?.tasks ?? [];

/**
 * 表示用 columns を返す。
 *
 * @param state useProject の現在 state
 * @returns 派生カラム配列
 */
const columnsOf = (state: ProjectState): Column[] =>
  displayableDataOf(state)?.columns ?? [];

/**
 * 表示用 doneColumn を返す。
 *
 * @param state useProject の現在 state
 * @returns 派生 doneColumn
 */
const doneColumnOf = (state: ProjectState): string | undefined =>
  displayableDataOf(state)?.doneColumn;

/**
 * @returns アプリケーションのルートレイアウトシェル
 */
export const App = () => {
  const { toasts, showToast, dismissToast } = useToasts();
  const {
    state,
    openProject,
    createTask,
    updateTask,
    deleteTask,
    updateColumns,
    moveTask,
    reorderColumns,
    addLink,
    removeLink,
  } = useProject({
    onError: (err) => {
      showToast(projectErrorMessage(err), "error");
    },
  });
  const { submit: submitCreateTask } = useTaskCreate({ createTask });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 削除楽観 dispatch 中に tasks から消えた target を一時保持する snapshot。
  // 存在する間は selectedTask 計算の fallback として参照され、DetailPanel が
  // pending 中も描画継続できる。rollback で tasks に戻れば自然と fallback は不要になる。
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [createModalStatus, setCreateModalStatus] = useState<string | null>(
    null,
  );
  const [createModalParent, setCreateModalParent] = useState<
    string | undefined
  >(undefined);
  // サブIssue 追加経路で親が自動セットされたことを示す state。
  // 値が入っているとき parentCandidates は親 1 件に絞られ、UI 上 read-only になる。
  // 親が tasks から消えても本 state は残るため、ParentTaskSelect の filePath fallback が起動する。
  const [subIssueParentPath, setSubIssueParentPath] = useState<
    string | undefined
  >(undefined);
  const [announcement, setAnnouncement] = useState<LiveAnnouncement | null>(
    null,
  );
  const announceCounterRef = useRef(0);
  const announce = useCallback((text: string) => {
    announceCounterRef.current += 1;
    setAnnouncement({ id: announceCounterRef.current, text });
  }, []);

  // プロジェクト切替時に UI 状態（選択中タスク・作成モーダル）をリセットする。
  // loaded 状態の path が「実際に別 path に変わった」ときだけ trigger する。
  // 中間状態 (loading / error / idle) は無視する。
  //
  // task ID が file path ベースで project 間で衝突しうるため、useEffect では
  // 最初の render が stale UI state で新プロジェクトのデータを参照する race が
  // 発生する。React 公式の "Adjusting state when a prop changes" パターン
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // に従い、render-phase で同期的に reset する。
  const loadedPath = state.kind === "loaded" ? state.path : null;
  const [prevLoadedPath, setPrevLoadedPath] = useState<string | null>(null);
  if (loadedPath !== null && loadedPath !== prevLoadedPath) {
    // project が切り替わった: 旧 project の UI state を一括 reset する。
    // 削除 pending 中の snapshot を残すと、新 project の DetailPanel に
    // 旧 project の task が fallback として表示されてしまう。
    setPrevLoadedPath(loadedPath);
    setSelectedTaskId(null);
    setCreateModalStatus(null);
    setCreateModalParent(undefined);
    setSubIssueParentPath(undefined);
    setPendingDeleteTask(null);
  } else if (state.kind !== "loaded") {
    // loaded から非 loaded (loading / error / idle) に抜けた: project を
    // 閉じた / 再 open 中 / 失敗状態。pending 中の snapshot と create modal は
    // それぞれ独立に保持されうるため、両方を同 render pass で reset する。
    if (pendingDeleteTask !== null) {
      setPendingDeleteTask(null);
    }
    if (createModalStatus !== null) {
      setCreateModalStatus(null);
      setCreateModalParent(undefined);
      setSubIssueParentPath(undefined);
    }
  }

  const tasks = tasksOf(state);
  const columns = columnsOf(state);
  const doneColumn = doneColumnOf(state);
  const tasksByNormalizedPath = useMemo(
    () => buildTasksByNormalizedPath(tasks),
    [tasks],
  );
  // Toast 発火管理用 ref。`prevLoadedPath` (UI リセット用、render-phase 更新) と
  // 役割を分離するため別 ref を持つ。
  // 「loaded セッション内で 1 回だけ発火」をルールとし、state.kind が "loaded" から
  // 離れた時点で ref をクリアすることで、close → reopen 同一 path のような再ロードでも
  // 改めて発火するようにする。
  const toastFiredForLoadedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.kind !== "loaded") {
      toastFiredForLoadedPathRef.current = null;
      return;
    }
    if (toastFiredForLoadedPathRef.current === loadedPath) {
      return;
    }
    toastFiredForLoadedPathRef.current = loadedPath;
    const n = countTasksWithBrokenLink(tasks, tasksByNormalizedPath);
    if (n >= 1) {
      showToast(`リンク切れが ${n} 件あります`, "warning");
    }
  }, [state.kind, loadedPath, tasks, tasksByNormalizedPath, showToast]);

  // パースエラー Toast 発火管理用 ref。リンク切れ Toast (toastFiredForLoadedPathRef) とは
  // 判定ドメイン・文言が別なので発火管理を分離する。ルールは同じく「loaded セッション内
  // 1 回発火」。state.kind が "loaded" を離れた時点で ref をクリアし、close → reopen /
  // 別 project 切替後 N >= 1 なら改めて 1 回発火する。
  const parseErrorToastFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.kind !== "loaded") {
      parseErrorToastFiredRef.current = null;
      return;
    }
    if (parseErrorToastFiredRef.current === loadedPath) {
      return;
    }
    parseErrorToastFiredRef.current = loadedPath;
    const n = countTasksWithParseError(tasks);
    if (n >= 1) {
      showToast(`パースエラーが ${n} 件あります`, "warning");
    }
  }, [state.kind, loadedPath, tasks, showToast]);
  // サブIssue モード中は親候補を 1 件に絞り、ユーザに「親が自動セットされた」ことを示す。
  // tasks から親が消えると filter 結果が [] になり、ParentTaskSelect の filePath fallback が起動する。
  const parentCandidates = useMemo(() => {
    if (subIssueParentPath === undefined) {
      return tasks;
    }
    return tasks.filter((t) => t.filePath === subIssueParentPath);
  }, [tasks, subIssueParentPath]);
  const parentReadOnly = subIssueParentPath !== undefined;
  // path 末尾セグメントを project 名として表示する。OS の path separator は
  // / / \ どちらにも対応する (Windows / POSIX 双方)。
  const displayedPath = state.kind === "loaded" ? state.path : null;
  const projectName =
    displayedPath !== null
      ? (displayedPath
          .split(/[\\/]/)
          .filter((seg) => seg.length > 0)
          .pop() ?? displayedPath)
      : undefined;
  const selectedTask = ((): Task | null => {
    if (selectedTaskId === null) {
      return null;
    }
    const found = tasks.find((t) => t.id === selectedTaskId);
    if (found !== undefined) {
      return found;
    }
    // 削除楽観 dispatch 中は tasks から消えているので snapshot を fallback として使う。
    // rollback で tasks に戻れば自然と found 側に切り替わる。
    if (pendingDeleteTask !== null && pendingDeleteTask.id === selectedTaskId) {
      return pendingDeleteTask;
    }
    return null;
  })();

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleSelectTask = useCallback(
    (taskId: string) => {
      const outcome = selectTaskOutcome(tasks, taskId);
      if (outcome === null) {
        return;
      }
      setSelectedTaskId(outcome.selectedTaskId);
      announce(outcome.announceText);
    },
    [tasks, announce],
  );

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleTaskUpdate = useCallback(
    async (id: string, updates: Partial<Omit<Task, "id">>) => {
      const filePath = tasks.find((t) => t.id === id)?.filePath;
      if (filePath === undefined) {
        return;
      }
      // filePath は lookup key なので spread 順序を後置にして上書き防止
      const result = await updateTask({ ...updates, filePath });
      if (!result.ok) {
        showToast(
          `タスクの更新に失敗しました: ${projectErrorMessage(result.error)}`,
          "error",
        );
        return;
      }
      showToast("タスクを更新しました", "success");
    },
    [tasks, updateTask, showToast],
  );

  const handleAddTask = useCallback((columnName: string) => {
    setCreateModalStatus(columnName);
    setCreateModalParent(undefined);
    setSubIssueParentPath(undefined);
  }, []);

  const handleAddColumn = useCallback(
    async (columnName: string): Promise<void> => {
      // 呼び出し時点の best-effort 検証（即座の UX フィードバック）
      if (columns.some((c) => c.name === columnName)) {
        showToast("同じ名前のカラムが既に存在します", "error");
        return;
      }
      const result = await updateColumns((current) => {
        // queue 実行時の最新 state で再検証（先行する add で重複していたら silent skip）
        if (current.columns.some((c) => c.name === columnName)) {
          return null;
        }
        const maxOrder = current.columns.reduce(
          (acc, c) => (c.order > acc ? c.order : acc),
          -1,
        );
        return {
          columns: [
            ...current.columns,
            { name: columnName, order: maxOrder + 1 },
          ],
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        showToast(`カラムの追加に失敗しました: ${message}`, "error");
        // AddColumnButton が editor を維持できるよう reject し直す
        throw new Error(message);
      }
      if (!result.value.applied) {
        // queue 内 silent skip (先行 add で同名カラムが追加済等)
        // AddColumnButton が editor を維持してユーザに retry させる
        const message =
          "カラムの追加が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラムを追加しました", "success");
    },
    [columns, updateColumns, showToast],
  );

  const handleRenameColumn = useCallback(
    async (oldName: string, newName: string): Promise<void> => {
      if (!columns.some((c) => c.name === oldName)) {
        return;
      }
      if (columns.some((c) => c.name === newName)) {
        showToast("同じ名前のカラムが既に存在します", "error");
        return;
      }
      const result = await updateColumns((current) => {
        if (!current.columns.some((c) => c.name === oldName)) {
          return null;
        }
        if (current.columns.some((c) => c.name === newName)) {
          return null;
        }
        // doneColumn が rename 対象なら新名に更新する。
        // 該当しない場合は undefined のままで BE/reducer 側が既存値を保持する。
        const doneColumn = current.doneColumn === oldName ? newName : undefined;
        return {
          columns: current.columns.map((c) =>
            c.name === oldName ? { ...c, name: newName } : c,
          ),
          renames: [{ from: oldName, to: newName }],
          doneColumn,
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        showToast(`カラム名の変更に失敗しました: ${message}`, "error");
        // ColumnHeader が edit mode を維持できるよう reject し直す
        throw new Error(message);
      }
      if (!result.value.applied) {
        // queue 内 silent skip (rename 対象が消えた / 重複が発生した等)
        // ColumnHeader が edit mode を維持してユーザに retry させる
        const message =
          "カラム名の変更が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラム名を変更しました", "success");
    },
    [columns, updateColumns, showToast],
  );

  const handleDeleteColumn = useCallback(
    async (
      columnName: string,
      destColumn: string | undefined,
    ): Promise<void> => {
      if (!columns.some((c) => c.name === columnName)) {
        return;
      }
      if (columns.length <= 1) {
        showToast("最後のカラムは削除できません", "error");
        return;
      }
      if (destColumn !== undefined) {
        if (
          destColumn === columnName ||
          !columns.some((c) => c.name === destColumn)
        ) {
          showToast("移動先カラムが不正です", "error");
          return;
        }
      } else if (tasks.some((t) => t.status === columnName)) {
        showToast("タスクが残っているため移動先カラムが必要です", "error");
        return;
      }
      const result = await updateColumns((current) => {
        if (!current.columns.some((c) => c.name === columnName)) {
          return null;
        }
        if (current.columns.length <= 1) {
          return null;
        }
        if (
          destColumn !== undefined &&
          !current.columns.some((c) => c.name === destColumn)
        ) {
          return null;
        }
        // command queue 実行までに先行 task command で対象カラムへタスクが
        // 追加される可能性がある。destColumn 未指定で残タスクがあれば silent skip
        // （呼び出し時点では 0 件だが、queue 実行時に 1 件以上へ増えていたケース）。
        if (
          destColumn === undefined &&
          current.tasks.some((t) => t.status === columnName)
        ) {
          return null;
        }
        // doneColumn が削除対象の場合、destColumn (タスク移動先) を新 doneColumn に
        // する。タスク 0 件削除 + destColumn 未指定の場合は残カラムの max-order を採用
        // (FE 全体で missing doneColumn を max-order column と扱う規約に整合させる)。
        const remainingColumns = current.columns.filter(
          (c) => c.name !== columnName,
        );
        const maxOrderColumn = remainingColumns.reduce<Column | undefined>(
          (acc, c) => (acc === undefined || c.order > acc.order ? c : acc),
          undefined,
        );
        let doneColumn: string | undefined;
        if (current.doneColumn === columnName) {
          doneColumn = destColumn ?? maxOrderColumn?.name;
        }
        return {
          columns: remainingColumns,
          renames:
            destColumn !== undefined
              ? [{ from: columnName, to: destColumn }]
              : undefined,
          doneColumn,
        };
      });
      if (!result.ok) {
        const message = projectErrorMessage(result.error);
        showToast(`カラムの削除に失敗しました: ${message}`, "error");
        // Column の ConfirmDialog が維持できるよう reject し直す
        throw new Error(message);
      }
      if (!result.value.applied) {
        // queue 内 silent skip (削除対象が消えた / タスク追加で destColumn 必要等)
        // ConfirmDialog を維持してユーザに retry させる
        const message =
          "カラムの削除が適用されませんでした (他の操作と競合した可能性)";
        showToast(message, "error");
        throw new Error(message);
      }
      showToast("カラムを削除しました", "success");
    },
    [columns, tasks, updateColumns, showToast],
  );

  const handleCloseCreateModal = useCallback(() => {
    setCreateModalStatus(null);
    setCreateModalParent(undefined);
    setSubIssueParentPath(undefined);
  }, []);

  const defaultCreateStatus =
    columns.length > 0
      ? columns.reduce((lowest, column) =>
          column.order < lowest.order ? column : lowest,
        ).name
      : null;

  const handleAddSubIssue = useCallback(
    (parentFilePath: string) => {
      if (defaultCreateStatus === null) {
        showToast("利用可能なステータスがありません", "error");
        return;
      }
      setCreateModalStatus(defaultCreateStatus);
      setCreateModalParent(parentFilePath);
      setSubIssueParentPath(parentFilePath);
    },
    [defaultCreateStatus, showToast],
  );

  const handleCreateTask = useCallback(
    async (values: TaskFormValues): Promise<void> => {
      const result = await submitCreateTask(values);
      if (!result.ok) {
        // モーダルを閉じない: TaskCreateModal は onSubmit reject で開いたままになる
        const message = projectErrorMessage(result.error);
        showToast(`タスクの作成に失敗しました: ${message}`, "error");
        throw new Error(message);
      }
      showToast("タスクを作成しました", "success");
    },
    [submitCreateTask, showToast],
  );

  const handleTaskDrop = useCallback(
    async (params: MoveTaskParams): Promise<void> => {
      const targetTitle =
        tasks.find((t) => t.filePath === params.taskFilePath)?.title ??
        params.taskFilePath;
      /**
       * カラム間 status 変更の楽観 dispatch 直後に呼ばれる callback。
       * 同一カラム並び替え（fromColumn === toColumn）では LiveRegion を更新しない。
       *
       * @param event optimistic 通知 payload
       */
      const onOptimisticApplied = (event: {
        fromColumn: string;
        toColumn: string;
      }): void => {
        if (event.fromColumn !== event.toColumn) {
          announce(`「${targetTitle}」を「${event.toColumn}」に移動しました`);
        }
      };
      /**
       * カラム間 updateTask 失敗時の rollback 完了直後に呼ばれる callback。
       * LiveRegion に「取り消しました」を流す。
       */
      const onRollback = (): void => {
        announce(`「${targetTitle}」の移動を取り消しました`);
      };
      const result = await moveTask(params, {
        onOptimisticApplied,
        onRollback,
      });
      if (!result.ok) {
        if (result.error.kind === "partial-move") {
          showToast(result.error.message, "error");
          return;
        }
        const message = projectErrorMessage(result.error);
        showToast(`タスクの移動に失敗しました: ${message}`, "error");
      }
    },
    [tasks, moveTask, announce, showToast],
  );

  const handleColumnReorder = useCallback(
    async (params: {
      fromColumnName: string;
      toColumnName: string;
    }): Promise<void> => {
      /**
       * 楽観 dispatch 直後に呼ばれる callback。LiveRegion で「N 番目に移動しました」をアナウンスする。
       *
       * @param event optimistic 通知 payload
       */
      const onOptimisticApplied = (event: ReorderColumnsEvent): void => {
        announce(
          `「${event.columnName}」を ${event.toIndex + 1} 番目に移動しました`,
        );
      };
      /**
       * rollback 完了直後に呼ばれる callback。LiveRegion に取り消しをアナウンスする。
       *
       * @param event rollback 通知 payload
       */
      const onRollback = (event: ReorderColumnsEvent): void => {
        announce(`「${event.columnName}」の移動を取り消しました`);
      };
      const result = await reorderColumns(
        params.fromColumnName,
        params.toColumnName,
        { onOptimisticApplied, onRollback },
      );
      if (result.ok) {
        return;
      }
      // project switch (invalid-state + PROJECT_SWITCHED_MESSAGE) は reducer が
      // 既に新 project に切替済みで、楽観 dispatch / rollback も走らないため
      // toast を出さない（無関係なエラー通知になる）。
      if (
        result.error.kind === "invalid-state" &&
        result.error.message === PROJECT_SWITCHED_MESSAGE
      ) {
        return;
      }
      showToast(
        `カラムの並び替えに失敗しました: ${projectErrorMessage(result.error)}`,
        "error",
      );
    },
    [reorderColumns, announce, showToast],
  );

  const handleAddLink = useCallback(
    async (sourceFilePath: string, targetFilePath: string) => {
      const source = tasks.find((t) => t.filePath === sourceFilePath);
      const target = tasks.find((t) => t.filePath === targetFilePath);
      const sourceTitle = source?.title || sourceFilePath;
      const targetTitle = target?.title || targetFilePath;

      const result = await addLink({
        filePath: sourceFilePath,
        targetFilePath,
      });

      if (!result.ok) {
        // project switch 由来の invalid-state は新 project に対する無関係な通知
        // になるため toast / announce を出さない（move/delete と同方針）。
        if (
          result.error.kind === "invalid-state" &&
          result.error.message === PROJECT_SWITCHED_MESSAGE
        ) {
          return result;
        }
        const message = projectErrorMessage(result.error);
        showToast(`リンクの追加に失敗しました: ${message}`, "error");
        announce(
          `「${sourceTitle}」への「${targetTitle}」のリンク追加を取り消しました`,
        );
        return result;
      }

      announce(`「${sourceTitle}」に「${targetTitle}」をリンクしました`);
      return result;
    },
    [tasks, addLink, announce, showToast],
  );

  const handleRemoveLink = useCallback(
    async (sourceFilePath: string, targetFilePath: string) => {
      const source = tasks.find((t) => t.filePath === sourceFilePath);
      const target = tasks.find((t) => t.filePath === targetFilePath);
      const sourceTitle = source?.title || sourceFilePath;
      const targetTitle = target?.title || targetFilePath;

      const result = await removeLink({
        filePath: sourceFilePath,
        targetFilePath,
      });

      if (!result.ok) {
        if (
          result.error.kind === "invalid-state" &&
          result.error.message === PROJECT_SWITCHED_MESSAGE
        ) {
          return result;
        }
        const message = projectErrorMessage(result.error);
        showToast(`リンクの削除に失敗しました: ${message}`, "error");
        announce(
          `「${sourceTitle}」から「${targetTitle}」へのリンク削除を取り消しました`,
        );
        return result;
      }

      announce(
        `「${sourceTitle}」から「${targetTitle}」へのリンクを削除しました`,
      );
      return result;
    },
    [tasks, removeLink, announce, showToast],
  );

  const handleTaskDelete = useCallback(
    async (id: string, orphanStrategy?: OrphanStrategy): Promise<void> => {
      const target = tasks.find((t) => t.id === id);
      if (target === undefined) {
        return;
      }
      const { filePath, title } = target;
      // 楽観 dispatch で tasks から target が消える前に snapshot を保持する。
      // pendingDeleteTask が存在する限り DetailPanel は描画を継続できる。
      setPendingDeleteTask(target);

      const result = await deleteTask({ filePath, orphanStrategy });

      if (!result.ok) {
        // rollback で tasks に target が戻るので snapshot は不要になる。
        setPendingDeleteTask(null);

        // project switch 由来の invalid-state は新 project に対する無関係な通知に
        // なるため toast / announce を出さない (reorderColumns と同方針)。
        // ただし useDeleteFlow は onDelete の resolve を success とみなすので、
        // 原因を残した Error を throw して deleting → error 遷移を成立させる
        // (UI には出ないが、useDeleteFlow.state.reason / ログ追跡で原因を保持する)。
        // queue 直列化により通常はこの経路に乗らない防御的フォールバック。
        if (
          result.error.kind === "invalid-state" &&
          result.error.message === PROJECT_SWITCHED_MESSAGE
        ) {
          throw new Error(PROJECT_SWITCHED_MESSAGE);
        }

        const message = projectErrorMessage(result.error);
        showToast(`タスクの削除に失敗しました: ${message}`, "error");
        announce(`「${title}」の削除を取り消しました`);
        throw new Error(message);
      }

      setSelectedTaskId(null);
      setPendingDeleteTask(null);
      showToast("タスクを削除しました", "success");
      announce(`「${title}」を削除しました`);
    },
    [tasks, deleteTask, showToast, announce],
  );

  /**
   * state.kind に応じて main 領域を描画する。
   *
   * @returns Loading / EmptyState / Board のいずれか
   */
  const renderMain = (): React.ReactNode => {
    if (state.kind === "loading") {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-gray-500">読み込み中…</p>
        </div>
      );
    }
    if (state.kind !== "loaded") {
      return <EmptyState type="no-project" onOpenProject={openProject} />;
    }
    // tasks 0 件でも Board は描画する (column UI / +追加 ボタンを残すため、
    // board-view spec に従う)。空プロジェクト時のガイダンスは Board 上に
    // 重ねて表示する。
    return (
      <div className="relative flex flex-1 overflow-hidden">
        <Board
          columns={columns}
          tasks={tasks}
          tasksByNormalizedPath={tasksByNormalizedPath}
          doneColumn={doneColumn}
          onAddTask={handleAddTask}
          onAddColumn={handleAddColumn}
          onRenameColumn={handleRenameColumn}
          onDeleteColumn={handleDeleteColumn}
          onTaskClick={handleTaskClick}
          onTaskDrop={handleTaskDrop}
          onColumnReorder={handleColumnReorder}
        />
        {tasks.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center">
            <p className="rounded bg-white/90 px-4 py-2 text-sm text-gray-500 shadow">
              タスクがありません。「+追加」ボタンまたはmdファイルを作成してタスクを追加してください
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <HeaderBar
        projectName={projectName}
        onSettingsClick={() => {}}
        onOpenClick={openProject}
      />
      <main className="flex flex-1 overflow-hidden">{renderMain()}</main>
      {selectedTask && (
        <DetailPanel
          task={selectedTask}
          columns={columns}
          allTasks={tasks}
          tasksByNormalizedPath={tasksByNormalizedPath}
          doneColumn={doneColumn}
          onClose={handleCloseDetail}
          onTaskUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onAddSubIssue={handleAddSubIssue}
          onSelectTask={handleSelectTask}
          onAddLink={handleAddLink}
          onRemoveLink={handleRemoveLink}
        />
      )}
      {createModalStatus !== null && (
        <TaskCreateModal
          columns={columns}
          initialStatus={createModalStatus}
          parentCandidates={parentCandidates}
          existingTasks={tasks}
          initialParent={createModalParent}
          parentReadOnly={parentReadOnly}
          onSubmit={handleCreateTask}
          onClose={handleCloseCreateModal}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <LiveRegion announcement={announcement} />
    </div>
  );
};
