import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Column } from "../../../types/task";
import { TaskForm, type TaskFormValues } from "./TaskForm";

type TaskCreateModalProps = {
	/** 選択肢となるカラム一覧 */
	columns: Column[];
	/** 初期ステータス（作成元カラム） */
	initialStatus: string;
	/**
	 * 送信時のコールバック。reject した場合モーダルは閉じない。
	 * 親側でトースト通知などのエラーハンドリングを行う想定。
	 * @param values - フォームの入力値
	 */
	onSubmit: (values: TaskFormValues) => Promise<void>;
	/** モーダルを閉じるコールバック（キャンセル・Esc・オーバーレイクリック） */
	onClose: () => void;
};

/**
 * タスク作成用モーダルダイアログ。
 * TaskForm を内包し、送信成功時に自動で閉じる。
 *
 * @param props - {@link TaskCreateModalProps}
 * @returns モーダル要素
 */
export function TaskCreateModal({
	columns,
	initialStatus,
	onSubmit,
	onClose,
}: TaskCreateModalProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const id = useId();
	const titleId = `${id}-title`;

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isSubmitting) {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose, isSubmitting]);

	const handleSubmit = useCallback(
		async (values: TaskFormValues) => {
			if (isSubmitting) return;
			setIsSubmitting(true);
			try {
				await onSubmit(values);
				onClose();
			} catch {
				// 親側で通知済み。モーダルは開いたままにする。
			} finally {
				setIsSubmitting(false);
			}
		},
		[isSubmitting, onSubmit, onClose],
	);

	const handleOverlayClick = useCallback(() => {
		if (isSubmitting) return;
		onClose();
	}, [isSubmitting, onClose]);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismisses modal on click, Escape key handled separately */}
			<div
				role="presentation"
				className="fixed inset-0 z-[60] bg-black/40"
				data-testid="task-create-overlay"
				onClick={handleOverlayClick}
			/>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className="fixed top-1/2 left-1/2 z-[70] w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-2xl"
				data-testid="task-create-dialog"
			>
				<h2 id={titleId} className="mb-4 text-lg font-semibold text-gray-900">
					新規タスクを作成
				</h2>
				<TaskForm
					columns={columns}
					initialStatus={initialStatus}
					isSubmitting={isSubmitting}
					onSubmit={handleSubmit}
					onCancel={onClose}
				/>
			</div>
		</>
	);
}
