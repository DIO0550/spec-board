import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

/** InlineEdit の Props */
type InlineEditProps = {
	/** 表示・編集する値 */
	value: string;
	/**
	 * 編集確定時のコールバック
	 * @param value - 確定された値
	 */
	onConfirm: (value: string) => void;
};

/**
 * クリックで編集モードに切り替わるインラインテキスト編集コンポーネント
 * @param props - {@link InlineEditProps}
 * @returns インライン編集要素
 */
export const InlineEdit = ({ value, onConfirm }: InlineEditProps) => {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);
	const isCancelledRef = useRef(false);

	useEffect(() => {
		setEditValue(value);
	}, [value]);

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	/** 編集内容を確定する。空文字の場合は元の値に戻す */
	const confirm = () => {
		const trimmed = editValue.trim();
		if (trimmed.length === 0) {
			setEditValue(value);
		} else if (trimmed !== value) {
			onConfirm(trimmed);
		}
		setIsEditing(false);
	};

	/** 編集をキャンセルし元の値に戻す */
	const cancel = () => {
		isCancelledRef.current = true;
		setEditValue(value);
		setIsEditing(false);
	};

	/** キーボードイベントを処理する（Enter: 確定、Escape: キャンセル） */
	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			e.stopPropagation();
			isCancelledRef.current = true;
			confirm();
		} else if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			cancel();
		}
	};

	if (isEditing) {
		return (
			<input
				ref={inputRef}
				type="text"
				value={editValue}
				onChange={(e) => setEditValue(e.target.value)}
				onKeyDown={handleKeyDown}
				onBlur={() => {
					if (!isCancelledRef.current) confirm();
					isCancelledRef.current = false;
				}}
				className="w-full rounded border border-blue-400 px-1 py-0.5 text-lg font-semibold text-gray-900 outline-none"
				data-testid="inline-edit-input"
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setIsEditing(true)}
			className="w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-lg font-semibold text-gray-900 hover:bg-gray-100"
			data-testid="inline-edit-display"
		>
			{value}
		</button>
	);
};
