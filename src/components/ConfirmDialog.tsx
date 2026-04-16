import { useEffect, useId, useRef } from "react";

type ConfirmDialogProps = {
	/** ダイアログのタイトル */
	title: string;
	/** 確認メッセージ */
	message: string;
	/** 確定ボタンのラベル（デフォルト: "確定"） */
	confirmLabel?: string;
	/** キャンセルボタンのラベル（デフォルト: "キャンセル"） */
	cancelLabel?: string;
	/** 確定ボタンを無効化するか */
	confirmDisabled?: boolean;
	/** キャンセルボタンを無効化するか */
	cancelDisabled?: boolean;
	/** 確定時のコールバック */
	onConfirm: () => void;
	/** キャンセル時のコールバック */
	onCancel: () => void;
};

/**
 * 確認ダイアログコンポーネント
 * @param props - {@link ConfirmDialogProps}
 * @returns ダイアログ要素
 */
export function ConfirmDialog({
	title,
	message,
	confirmLabel = "確定",
	cancelLabel = "キャンセル",
	confirmDisabled = false,
	cancelDisabled = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const id = useId();
	const titleId = `${id}-title`;
	const messageId = `${id}-message`;

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !cancelDisabled) {
				onCancel();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onCancel, cancelDisabled]);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismisses dialog on click, Escape key handled separately */}
			<div
				role="presentation"
				className="fixed inset-0 z-[60] bg-black/40"
				data-testid="confirm-overlay"
				onClick={cancelDisabled ? undefined : onCancel}
			/>
			<div
				ref={dialogRef}
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={messageId}
				tabIndex={-1}
				className="fixed top-1/2 left-1/2 z-[70] w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-2xl"
				data-testid="confirm-dialog"
			>
				<h2 id={titleId} className="text-lg font-semibold text-gray-900">
					{title}
				</h2>
				<p id={messageId} className="mt-2 text-sm text-gray-600">
					{message}
				</p>
				<div className="mt-6 flex justify-end gap-3">
					<button
						type="button"
						className="rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
						data-testid="confirm-cancel-button"
						disabled={cancelDisabled}
						onClick={onCancel}
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
						data-testid="confirm-confirm-button"
						disabled={confirmDisabled}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</>
	);
}
