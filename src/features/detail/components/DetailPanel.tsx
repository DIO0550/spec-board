import { useEffect, useRef } from "react";
import type { Task } from "../../../types/task";

/** 詳細パネルの Props */
type DetailPanelProps = {
	/** 表示するタスク */
	task: Task;
	/** パネルを閉じるコールバック */
	onClose: () => void;
};

/**
 * 右側からスライドインするタスク詳細パネル
 * @param props - {@link DetailPanelProps}
 * @returns パネル要素
 */
export function DetailPanel({ task, onClose }: DetailPanelProps) {
	const panelRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	useEffect(() => {
		panelRef.current?.focus();
	}, []);

	return (
		<>
			<button
				type="button"
				aria-label="詳細パネルを閉じる"
				className="fixed inset-0 z-40 border-0 bg-black/30 p-0"
				data-testid="detail-overlay"
				onClick={onClose}
			/>
			<aside
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-label="タスク詳細"
				tabIndex={-1}
				className="fixed top-0 right-0 z-50 flex h-full w-[480px] max-w-full animate-slide-in flex-col bg-white shadow-xl"
			>
				<div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
					<h2 className="truncate text-lg font-semibold text-gray-900">
						{task.title || task.filePath}
					</h2>
					<button
						type="button"
						aria-label="閉じる"
						className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
						onClick={onClose}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
								clipRule="evenodd"
							/>
						</svg>
					</button>
				</div>
				<div className="flex-1 overflow-y-auto p-4">
					<p className="text-sm text-gray-600">{task.body}</p>
				</div>
			</aside>
		</>
	);
}
