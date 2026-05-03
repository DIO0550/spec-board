import { useCallback, useEffect, useRef, useState } from "react";
import { ToastContainer } from "@/components/ToastContainer";
import { useToasts } from "@/hooks/useToasts";
import {
  Board,
  EmptyState,
  HeaderBar,
  type ProjectError,
  type ProjectState,
  useProject,
} from "./features/board";
import { DetailPanel } from "./features/detail";
import { TaskCreateModal, type TaskFormValues } from "./features/task-form";
import type { Column } from "./types/column";
import type { Task } from "./types/task";

/**
 * `ProjectError` から人間可読なメッセージを取り出す。
 *
 * @param err useProject から運ばれるエラー
 * @returns toast 等に出せる文字列
 */
const projectErrorMessage = (err: ProjectError): string =>
  err.kind === "tauri" ? err.error.message : err.message;

/**
 * loaded 時のみ tasks を返す。それ以外は空配列。
 *
 * @param state useProject の現在 state
 * @returns 派生タスク配列
 */
const tasksOf = (state: ProjectState): Task[] =>
  state.kind === "loaded" ? state.data.tasks : [];

/**
 * loaded 時のみ columns を返す。それ以外は空配列。
 *
 * @param state useProject の現在 state
 * @returns 派生カラム配列
 */
const columnsOf = (state: ProjectState): Column[] =>
  state.kind === "loaded" ? state.data.columns : [];

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
  } = useProject({
    onError: (err) => {
      showToast(projectErrorMessage(err), "error");
    },
  });

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createModalStatus, setCreateModalStatus] = useState<string | null>(
    null,
  );
  const [createModalParent, setCreateModalParent] = useState<
    string | undefined
  >(undefined);

  // プロジェクト切替時に UI 状態（選択中タスク・作成モーダル）をリセットする。
  // loaded 状態の path 変化を検出し、初回 idle→loaded への遷移時もここで初期化する。
  const loadedPath = state.kind === "loaded" ? state.path : null;
  const lastLoadedPathRef = useRef<string | null>(loadedPath);
  useEffect(() => {
    if (loadedPath !== lastLoadedPathRef.current) {
      lastLoadedPathRef.current = loadedPath;
      setSelectedTaskId(null);
      setCreateModalStatus(null);
      setCreateModalParent(undefined);
    }
  }, [loadedPath]);

  const tasks = tasksOf(state);
  const columns = columnsOf(state);
  const selectedTask = selectedTaskId
    ? (tasks.find((t) => t.id === selectedTaskId) ?? null)
    : null;

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleTaskUpdate = useCallback(
    async (id: string, updates: Partial<Omit<Task, "id">>) => {
      const filePath = tasks.find((t) => t.id === id)?.filePath;
      if (filePath === undefined) {
        return;
      }
      const result = await updateTask({ filePath, ...updates });
      if (!result.ok) {
        return;
      }
      showToast("タスクを更新しました", "success");
    },
    [tasks, updateTask, showToast],
  );

  const handleAddTask = useCallback((columnName: string) => {
    setCreateModalStatus(columnName);
    setCreateModalParent(undefined);
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
        return;
      }
      if (!result.value.applied) {
        return;
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
        return {
          columns: current.columns.map((c) =>
            c.name === oldName ? { ...c, name: newName } : c,
          ),
          renames: [{ from: oldName, to: newName }],
        };
      });
      if (!result.ok) {
        return;
      }
      if (!result.value.applied) {
        return;
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
        return {
          columns: current.columns.filter((c) => c.name !== columnName),
          renames:
            destColumn !== undefined
              ? [{ from: columnName, to: destColumn }]
              : undefined,
        };
      });
      if (!result.ok) {
        return;
      }
      if (!result.value.applied) {
        return;
      }
      showToast("カラムを削除しました", "success");
    },
    [columns, tasks, updateColumns, showToast],
  );

  const handleCloseCreateModal = useCallback(() => {
    setCreateModalStatus(null);
    setCreateModalParent(undefined);
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
    },
    [defaultCreateStatus, showToast],
  );

  const handleCreateTask = useCallback(
    async (values: TaskFormValues): Promise<void> => {
      const result = await createTask(values);
      if (!result.ok) {
        // モーダルを閉じない: TaskCreateModal は onSubmit reject で開いたままになる
        throw new Error(projectErrorMessage(result.error));
      }
      showToast("タスクを作成しました", "success");
    },
    [createTask, showToast],
  );

  const handleTaskDelete = useCallback(
    async (id: string): Promise<void> => {
      const filePath = tasks.find((t) => t.id === id)?.filePath;
      if (filePath === undefined) {
        return;
      }
      const result = await deleteTask({ filePath });
      if (!result.ok) {
        return;
      }
      setSelectedTaskId(null);
      showToast("タスクを削除しました", "success");
    },
    [tasks, deleteTask, showToast],
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
    return (
      <Board
        columns={columns}
        tasks={tasks}
        onAddTask={handleAddTask}
        onAddColumn={handleAddColumn}
        onRenameColumn={handleRenameColumn}
        onDeleteColumn={handleDeleteColumn}
        onTaskClick={handleTaskClick}
      />
    );
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <HeaderBar onSettingsClick={() => {}} onOpenClick={openProject} />
      <main className="flex flex-1 overflow-hidden">{renderMain()}</main>
      {selectedTask && (
        <DetailPanel
          task={selectedTask}
          columns={columns}
          allTasks={tasks}
          onClose={handleCloseDetail}
          onTaskUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
          onAddSubIssue={handleAddSubIssue}
        />
      )}
      {createModalStatus !== null && (
        <TaskCreateModal
          columns={columns}
          initialStatus={createModalStatus}
          parentCandidates={tasks}
          initialParent={createModalParent}
          onSubmit={handleCreateTask}
          onClose={handleCloseCreateModal}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
