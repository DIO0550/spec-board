import { useState } from "react";
import { EmptyState, HeaderBar } from "./features/board";
import type { Task } from "./types/task";

/**
 * @returns {JSX.Element} アプリケーションのルートレイアウトシェル
 */
function App() {
	const [projectPath, setProjectPath] = useState<string | null>(null);
	const [tasks] = useState<Task[]>([]);

	const handleOpenProject = () => {
		// 未実装の間は projectPath を更新しない。
		void setProjectPath;
	};

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden">
			<HeaderBar onSettingsClick={() => {}} onOpenClick={handleOpenProject} />
			<main className="flex flex-1 overflow-hidden">
				{projectPath === null ? (
					<EmptyState type="no-project" onOpenProject={handleOpenProject} />
				) : tasks.length === 0 ? (
					<EmptyState type="empty-project" />
				) : null}
			</main>
		</div>
	);
}

export default App;
