import { HeaderBar } from "./features/board";

/**
 * @returns {JSX.Element} アプリケーションのルートレイアウトシェル
 */
function App() {
	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden">
			<HeaderBar onSettingsClick={() => {}} onOpenClick={() => {}} />
			<main className="flex-1" />
		</div>
	);
}

export default App;
