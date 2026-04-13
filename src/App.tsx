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
		// TODO: 実際のファイル/フォルダ選択処理を実装し、
		// 選択結果が取得できた場合のみ projectPath を更新する。
		// 仮実装: プロジェクト選択ダイアログ完成後に置き換える
		setProjectPath("/tmp/placeholder");
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
