import { useCallback, useEffect, useRef, useState } from "react";
import { ToastContainer } from "@/components/ToastContainer";
import { useToasts } from "@/hooks/useToasts";
import {
  createTask,
  deleteTask,
  getColumns,
  getTasks,
  updateColumns,
  updateTask,
} from "@/lib/api";
import { Board, EmptyState, HeaderBar } from "./features/board";
import { DetailPanel } from "./features/detail";
import { TaskCreateModal, type TaskFormValues } from "./features/task-form";
import type { Column, Task } from "./types/task";

/**
 * @returns {JSX.Element} アプリケーションのルートレイアウトシェル
 */
export const App = () => {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [createModalStatus, setCreateModalStatus] = useState<string | null>(
    null,
  );
  const [createModalParent, setCreateModalParent] = useState<
    string | undefined
  >(undefined);
  const { toasts, showToast, dismissToast } = useToasts();
  const columnsRef = useRef<Column[]>(columns);
  const columnsQueueRef = useRef<Promise<void>>(Promise.resolve());
  const tasksRef = useRef<Task[]>(tasks);

  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const selectedTask = selectedTaskId
    ? (tasks.find((t) => t.id === selectedTaskId) ?? null)
    : null;

  const handleOpenProject = () => {
    setProjectPath("mock-project");
  };

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const handleTaskUpdate = useCallback(
    async (id: string, updates: Partial<Omit<Task, "id">>) => {
      try {
        const updated = await updateTask(id, updates);
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
        showToast("タスクを更新しました", "success");
      } catch {
        showToast("タスクの更新に失敗しました", "error");
      }
    },
    [showToast],
  );

  const handleAddTask = useCallback((columnName: string) => {
    setCreateModalStatus(columnName);
    setCreateModalParent(undefined);
  }, []);

  /**
   * 新規カラムの追加。成功時はカラム一覧を更新しトーストを表示、失敗時はトースト表示のみ行う。
   * @param columnName - 追加するカラム名（trim 済み、既存と非重複）
   */
  const handleAddColumn = useCallback(
    (columnName: string): Promise<void> => {
      const next = columnsQueueRef.current.then(async () => {
        try {
          const current = columnsRef.current;
          if (current.some((c) => c.name === columnName)) {
            showToast("同じ名前のカラムが既に存在します", "error");
            return;
          }
          const maxOrder = current.reduce(
            (acc, c) => (c.order > acc ? c.order : acc),
            -1,
          );
          const nextColumns: Column[] = [
            ...current,
            { name: columnName, order: maxOrder + 1 },
          ];
          const updated = await updateColumns(nextColumns);
          columnsRef.current = updated;
          setColumns(updated);
          showToast("カラムを追加しました", "success");
        } catch {
          showToast("カラムの追加に失敗しました", "error");
        }
      });
      columnsQueueRef.current = next;
      return next;
    },
    [showToast],
  );

  /**
   * 既存カラムの名前変更。カラム追加と同じキューで直列化し、競合を防ぐ。
   * 成功時はカラムとタスクの status を更新、失敗時はトースト表示のみ行う。
   * @param oldName - 元のカラム名
   * @param newName - 新しいカラム名（trim 済み、既存と非重複）
   */
  const handleRenameColumn = useCallback(
    (oldName: string, newName: string): Promise<void> => {
      const next = columnsQueueRef.current.then(async () => {
        try {
          const current = columnsRef.current;
          if (!current.some((c) => c.name === oldName)) {
            return;
          }
          if (current.some((c) => c.name === newName)) {
            showToast("同じ名前のカラムが既に存在します", "error");
            return;
          }
          const nextColumns: Column[] = current.map((c) =>
            c.name === oldName ? { ...c, name: newName } : c,
          );
          const updated = await updateColumns(nextColumns, [
            { from: oldName, to: newName },
          ]);
          columnsRef.current = updated;
          setColumns(updated);
          setTasks((prev) =>
            prev.map((t) =>
              t.status === oldName ? { ...t, status: newName } : t,
            ),
          );
          showToast("カラム名を変更しました", "success");
        } catch {
          showToast("カラム名の変更に失敗しました", "error");
        }
      });
      columnsQueueRef.current = next;
      return next;
    },
    [showToast],
  );

  /**
   * 既存カラムの削除。カラム追加・リネームと同じキューで直列化し、競合を防ぐ。
   * destColumn 指定時は削除対象カラムのタスクを移動先へ status 変更する。
   * カラムが 1 つしかない場合は何もしない。
   * @param columnName - 削除するカラム名
   * @param destColumn - 移動先のカラム名。タスクが 0 件の場合は undefined
   */
  const handleDeleteColumn = useCallback(
    (columnName: string, destColumn: string | undefined): Promise<void> => {
      const next = columnsQueueRef.current.then(async () => {
        try {
          const current = columnsRef.current;
          if (!current.some((c) => c.name === columnName)) {
            return;
          }
          if (current.length <= 1) {
            showToast("最後のカラムは削除できません", "error");
            return;
          }
          if (destColumn !== undefined) {
            if (
              destColumn === columnName ||
              !current.some((c) => c.name === destColumn)
            ) {
              showToast("移動先カラムが不正です", "error");
              return;
            }
          } else if (tasksRef.current.some((t) => t.status === columnName)) {
            showToast("タスクが残っているため移動先カラムが必要です", "error");
            return;
          }
          const nextColumns: Column[] = current.filter(
            (c) => c.name !== columnName,
          );
          const renames =
            destColumn !== undefined
              ? [{ from: columnName, to: destColumn }]
              : undefined;
          const updated = await updateColumns(nextColumns, renames);
          columnsRef.current = updated;
          setColumns(updated);
          if (destColumn !== undefined) {
            setTasks((prev) =>
              prev.map((t) =>
                t.status === columnName ? { ...t, status: destColumn } : t,
              ),
            );
          }
          showToast("カラムを削除しました", "success");
        } catch {
          showToast("カラムの削除に失敗しました", "error");
        }
      });
      columnsQueueRef.current = next;
      return next;
    },
    [showToast],
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

  /**
   * 新規タスクの作成。成功時は一覧を更新しトーストを表示、失敗時はトースト表示のうえ呼び出し元へ再 throw する。
   * @param values - タスク作成フォームの入力値
   * @throws createTask API 呼び出しが失敗した場合
   */
  const handleCreateTask = useCallback(
    async (values: TaskFormValues) => {
      try {
        const created = await createTask(values);
        setTasks((prev) => {
          const withCreated = [...prev, created];
          if (created.parent === undefined) {
            return withCreated;
          }
          return withCreated.map((t) =>
            t.filePath === created.parent &&
            !t.children.includes(created.filePath)
              ? { ...t, children: [...t.children, created.filePath] }
              : t,
          );
        });
        showToast("タスクを作成しました", "success");
      } catch (error) {
        showToast("タスクの作成に失敗しました", "error");
        throw error;
      }
    },
    [showToast],
  );

  const handleTaskDelete = useCallback(
    (id: string): Promise<void> =>
      deleteTask(id).then(
        () => {
          setTasks((prev) => prev.filter((t) => t.id !== id));
          setSelectedTaskId(null);
          showToast("タスクを削除しました", "success");
        },
        (error: unknown) => {
          showToast("タスクの削除に失敗しました", "error");
          return Promise.reject(error);
        },
      ),
    [showToast],
  );

  useEffect(() => {
    if (projectPath === null) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setSelectedTaskId(null);
    (async () => {
      const [loadedTasks, loadedColumns] = await Promise.all([
        getTasks(),
        getColumns(),
      ]);
      if (cancelled) {
        return;
      }
      setTasks(loadedTasks);
      setColumns(loadedColumns);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <HeaderBar onSettingsClick={() => {}} onOpenClick={handleOpenProject} />
      <main className="flex flex-1 overflow-hidden">
        {projectPath === null ? (
          <EmptyState type="no-project" onOpenProject={handleOpenProject} />
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-gray-500">読み込み中…</p>
          </div>
        ) : (
          <Board
            columns={columns}
            tasks={tasks}
            onAddTask={handleAddTask}
            onAddColumn={handleAddColumn}
            onRenameColumn={handleRenameColumn}
            onDeleteColumn={handleDeleteColumn}
            onTaskClick={handleTaskClick}
          />
        )}
      </main>
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
