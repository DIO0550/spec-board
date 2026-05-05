import { useCallback, useState } from "react";
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
    setPrevLoadedPath(loadedPath);
    setSelectedTaskId(null);
    setCreateModalStatus(null);
    setCreateModalParent(undefined);
  } else if (state.kind !== "loaded" && createModalStatus !== null) {
    setCreateModalStatus(null);
    setCreateModalParent(undefined);
  }

  const tasks = tasksOf(state);
  const columns = columnsOf(state);
  const doneColumn = doneColumnOf(state);
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
        // task command は updateColumns command と直列化されないため、enqueue 後 queue
        // 実行までに別経路でカラムへタスクが追加される可能性がある。destColumn 未指定で
        // 残タスクがあれば silent skip（呼び出し時点では 0 件だが、queue 実行時に
        // race で 1 件以上に増えていたケース）。
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
        const message = projectErrorMessage(result.error);
        showToast(`タスクの作成に失敗しました: ${message}`, "error");
        throw new Error(message);
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
        // useDeleteFlow は onDelete の resolve を success とみなして dialog を閉じる。
        // 失敗時は reject + error toast で dialog を維持し、ユーザに retry を促す。
        const message = projectErrorMessage(result.error);
        showToast(`タスクの削除に失敗しました: ${message}`, "error");
        throw new Error(message);
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
    // tasks 0 件でも Board は描画する (column UI / +追加 ボタンを残すため、
    // board-view spec に従う)。空プロジェクト時のガイダンスは Board 上に
    // 重ねて表示する。
    return (
      <div className="relative flex flex-1 overflow-hidden">
        <Board
          columns={columns}
          tasks={tasks}
          doneColumn={doneColumn}
          onAddTask={handleAddTask}
          onAddColumn={handleAddColumn}
          onRenameColumn={handleRenameColumn}
          onDeleteColumn={handleDeleteColumn}
          onTaskClick={handleTaskClick}
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
          doneColumn={doneColumn}
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
