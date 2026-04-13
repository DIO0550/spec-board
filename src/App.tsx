import { useEffect, useState } from "react";
import { Board, EmptyState, HeaderBar } from "./features/board";
import { getColumns, getTasks } from "./lib/api";
import type { Column, Task } from "./types/task";

/**
 * @returns {JSX.Element} アプリケーションのルートレイアウトシェル
 */
function App() {
	const [projectPath, setProjectPath] = useState<string | null>(null);
	const [tasks, setTasks] = useState<Task[]>([]);
	const [columns, setColumns] = useState<Column[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const handleOpenProject = () => {
		setProjectPath("mock-project");
	};

	useEffect(() => {
		if (projectPath === null) return;
		let cancelled = false;
		setIsLoading(true);
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
					<Board columns={columns} tasks={tasks} onAddTask={() => {}} />
				)}
			</main>
		</div>
	);
}

export default App;
