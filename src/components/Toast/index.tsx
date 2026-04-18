import { useEffect } from "react";
import type { ToastItem, ToastType } from "@/types/toast";

export const TOAST_DEFAULT_DURATION_MS = 3000;

const typeStyles: Record<ToastType, string> = {
	success: "bg-green-600 text-white",
	error: "bg-red-600 text-white",
	warning: "bg-yellow-500 text-gray-900",
};

type ToastProps = {
	/** 表示するトースト */
	toast: ToastItem;
	/**
	 * 自動クローズ時に呼ばれるコールバック
	 * @param id - 閉じるトーストの ID
	 */
	onDismiss: (id: string) => void;
	/** 自動で閉じるまでの時間（ミリ秒）。デフォルト {@link TOAST_DEFAULT_DURATION_MS} */
	duration?: number;
};

/**
 * 単一のトーストを描画するコンポーネント。
 * duration 経過後に onDismiss を呼ぶ。
 * @param props - {@link ToastProps}
 * @returns トースト要素
 */
export const Toast = ({
	toast,
	onDismiss,
	duration = TOAST_DEFAULT_DURATION_MS,
}: ToastProps) => {
	useEffect(() => {
		const timer = setTimeout(() => onDismiss(toast.id), duration);
		return () => clearTimeout(timer);
	}, [toast.id, onDismiss, duration]);

	const isError = toast.type === "error";

	return (
		<div
			role={isError ? "alert" : "status"}
			aria-live={isError ? "assertive" : "polite"}
			data-testid={`toast-${toast.type}`}
			data-toast-id={toast.id}
			className={`min-w-[240px] rounded-md px-4 py-2 text-sm shadow-lg ${typeStyles[toast.type]}`}
		>
			{toast.message}
		</div>
	);
};
