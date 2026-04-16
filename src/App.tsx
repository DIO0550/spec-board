import { useCallback, useEffect, useState } from "react";
import { ToastContainer, useToasts } from "./components/Toast";
import { Board, EmptyState, HeaderBar } from "./features/board";
import { DetailPanel } from "./features/detail";
import { TaskCreateModal, type TaskFormValues } from "./features/task-form";
import {
	createTask,
	deleteTask,
	getColumns,
	getTasks,
	updateTask,
} from "./lib/api";
import type { Column, Task } from "./types/task";

/**
 * @returns {JSX.Element} アプリケーションのルートレイアウトシェル
 */
function App() {
	const [projectPath, setProjectPath] = useState<string | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [columns, setColumns] = useState<Column[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [createModalStatus, setCreateModalStatus] = useState<string | null>(
		null,
	);
	const { toasts, showToast, dismissToast } = useToasts();

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
	}, []);

	const handleCloseCreateModal = useCallback(() => {
		setCreateModalStatus(null);
	}, []);

	/**
	 * 新規タスクの作成。成功時は一覧を更新しトーストを表示、失敗時はトースト表示のうえ呼び出し元へ再 throw する。
	 * @param values - タスク作成フォームの入力値
	 * @throws createTask API 呼び出しが失敗した場合
	 */
	const handleCreateTask = useCallback(
		async (values: TaskFormValues) => {
			try {
				const created = await createTask(values);
				setTasks((prev) => [...prev, created]);
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
		if (projectPath === null) return;
		let cancelled = false;
		setIsLoading(true);
		setSelectedTaskId(null);
		(async () => {
			const [loadedTasks, loadedColumns] = await Promise.all([
				getTasks(),
				getColumns(),
			]);
			if (cancelled) return;
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
						onTaskClick={handleTaskClick}
					/>
				)}
			</main>
			{selectedTask && (
				<DetailPanel
					task={selectedTask}
					columns={columns}
					onClose={handleCloseDetail}
					onTaskUpdate={handleTaskUpdate}
					onDelete={handleTaskDelete}
				/>
			)}
			{createModalStatus !== null && (
				<TaskCreateModal
					columns={columns}
					initialStatus={createModalStatus}
					onSubmit={handleCreateTask}
					onClose={handleCloseCreateModal}
				/>
			)}
			<ToastContainer toasts={toasts} onDismiss={dismissToast} />
		</div>
	);
}

export default App;
