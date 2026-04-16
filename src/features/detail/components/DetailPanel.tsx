import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import type { Column, Priority, Task } from "../../../types/task";
import { InlineEdit } from "./InlineEdit";
import { LabelEditor } from "./LabelEditor";
import { MarkdownBody } from "./MarkdownBody";
import { PrioritySelect } from "./PrioritySelect";
import { StatusSelect } from "./StatusSelect";

/** 詳細パネルの Props */
type DetailPanelProps = {
	/** 表示するタスク */
	task: Task;
	/** 選択肢となるカラム一覧 */
	columns: Column[];
	/** パネルを閉じるコールバック */
	onClose: () => void;
	/**
	 * タスク更新時のコールバック
	 * @param id - 更新対象のタスクID
	 * @param updates - 更新するフィールド
	 */
	onTaskUpdate: (id: string, updates: Partial<Omit<Task, "id">>) => void;
	/**
	 * タスク削除時のコールバック
	 * @param id - 削除対象のタスクID
	 */
	onDelete: (id: string) => void | Promise<void>;
};

/**
 * 右側からスライドインするタスク詳細パネル
 * @param props - {@link DetailPanelProps}
 * @returns パネル要素
 */
export function DetailPanel({
	task,
	columns,
	onClose,
	onTaskUpdate,
	onDelete,
}: DetailPanelProps) {
	const panelRef = useRef<HTMLElement>(null);
	const latestLabelsRef = useRef(task.labels);
	latestLabelsRef.current = task.labels;
	const [showConfirm, setShowConfirm] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleTitleConfirm = useCallback(
		(title: string) => {
			onTaskUpdate(task.id, { title });
		},
		[task.id, onTaskUpdate],
	);

	const handleStatusChange = useCallback(
		(status: string) => {
			onTaskUpdate(task.id, { status });
		},
		[task.id, onTaskUpdate],
	);

	const handlePriorityChange = useCallback(
		(priority: Priority | undefined) => {
			onTaskUpdate(task.id, { priority });
		},
		[task.id, onTaskUpdate],
	);

	const handleLabelAdd = useCallback(
		(label: string) => {
			const updated = [...latestLabelsRef.current, label];
			latestLabelsRef.current = updated;
			onTaskUpdate(task.id, { labels: updated });
		},
		[task.id, onTaskUpdate],
	);

	const handleLabelRemove = useCallback(
		(label: string) => {
			const updated = latestLabelsRef.current.filter((l) => l !== label);
			latestLabelsRef.current = updated;
			onTaskUpdate(task.id, { labels: updated });
		},
		[task.id, onTaskUpdate],
	);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !showConfirm) {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose, showConfirm]);

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
					<div className="min-w-0 flex-1">
						<InlineEdit
							value={task.title || task.filePath}
							onConfirm={handleTitleConfirm}
						/>
					</div>
					<button
						type="button"
						aria-label="閉じる"
						className="ml-2 shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
					<div className="flex flex-col gap-4">
						<div className="flex gap-4">
							<StatusSelect
								value={task.status}
								columns={columns}
								onChange={handleStatusChange}
							/>
							<PrioritySelect
								value={task.priority}
								onChange={handlePriorityChange}
							/>
						</div>
						<LabelEditor
							labels={task.labels}
							onAdd={handleLabelAdd}
							onRemove={handleLabelRemove}
						/>
						<MarkdownBody body={task.body} />
					</div>
				</div>
				<div className="border-t border-gray-200 px-4 py-3">
					<p
						className="mb-3 truncate text-xs text-gray-400"
						data-testid="detail-file-path"
					>
						{task.filePath}
					</p>
					<button
						type="button"
						className="w-full rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
						data-testid="detail-delete-button"
						onClick={() => setShowConfirm(true)}
					>
						削除
					</button>
				</div>
			</aside>
			{showConfirm && (
				<ConfirmDialog
					title="タスクの削除"
					message={`「${task.title || task.filePath}」を削除しますか？この操作は取り消せません。`}
					confirmLabel={isDeleting ? "削除中…" : "削除"}
					confirmDisabled={isDeleting}
					cancelDisabled={isDeleting}
					onConfirm={async () => {
						if (isDeleting) return;
						setIsDeleting(true);
						try {
							await onDelete(task.id);
						} catch {
							// エラー時のみ削除中状態を解除（再試行可能にする）
						} finally {
							setIsDeleting(false);
							setShowConfirm(false);
						}
					}}
					onCancel={() => {
						if (!isDeleting) setShowConfirm(false);
					}}
				/>
			)}
		</>
	);
}
