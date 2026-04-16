import { useEffect, useRef } from "react";

/** ColumnContextMenu の Props */
type ColumnContextMenuProps = {
	/** 表示位置 X 座標（clientX） */
	x: number;
	/** 表示位置 Y 座標（clientY） */
	y: number;
	/** 削除メニュー項目を有効化するか（false の場合はクリック不可） */
	canDelete: boolean;
	/** 「削除」項目クリック時のコールバック */
	onDelete: () => void;
	/** メニューを閉じるコールバック（外側クリック・Esc・項目選択後） */
	onClose: () => void;
};

/**
 * カラムヘッダーの右クリック時に表示されるコンテキストメニュー。
 * 現時点では「削除」項目のみを提供する。
 * @param props - {@link ColumnContextMenuProps}
 * @returns コンテキストメニュー要素
 */
export function ColumnContextMenu({
	x,
	y,
	canDelete,
	onDelete,
	onClose,
}: ColumnContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismisses menu on click; Escape handled separately */}
			<div
				role="presentation"
				className="fixed inset-0 z-40"
				data-testid="column-context-menu-overlay"
				onClick={onClose}
				onContextMenu={(e) => {
					e.preventDefault();
					onClose();
				}}
			/>
			<div
				ref={menuRef}
				role="menu"
				aria-label="カラム操作"
				style={{ top: y, left: x }}
				className="fixed z-50 min-w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
				data-testid="column-context-menu"
			>
				<button
					type="button"
					role="menuitem"
					disabled={!canDelete}
					onClick={() => {
						onDelete();
						onClose();
					}}
					className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
					data-testid="column-context-menu-delete"
				>
					削除
				</button>
			</div>
		</>
	);
}
