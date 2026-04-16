import { useCallback, useEffect, useState } from "react";

export type ToastType = "success" | "error" | "warning";

export type ToastItem = {
	id: string;
	message: string;
	type: ToastType;
};

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
export function Toast({
	toast,
	onDismiss,
	duration = TOAST_DEFAULT_DURATION_MS,
}: ToastProps) {
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
}

type ToastContainerProps = {
	/** 表示中のトースト一覧（配列順＝上から下に積まれる） */
	toasts: ToastItem[];
	/**
	 * トーストを閉じるコールバック
	 * @param id - 閉じるトーストの ID
	 */
	onDismiss: (id: string) => void;
	/** 各トーストを閉じるまでの時間（ミリ秒） */
	duration?: number;
};

/**
 * 複数のトーストを画面右上に縦スタックで描画するコンテナ。
 * toasts が空の場合は何も描画しない。
 * @param props - {@link ToastContainerProps}
 * @returns コンテナ要素、または null
 */
export function ToastContainer({
	toasts,
	onDismiss,
	duration,
}: ToastContainerProps) {
	if (toasts.length === 0) return null;
	return (
		<div
			className="pointer-events-none fixed top-4 right-4 z-[80] flex flex-col gap-2"
			data-testid="toast-container"
		>
			{toasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<Toast toast={toast} onDismiss={onDismiss} duration={duration} />
				</div>
			))}
		</div>
	);
}

/**
 * トースト ID を生成する。
 * crypto.randomUUID が使える環境ではそれを使い、未対応環境では
 * crypto.getRandomValues を使った簡易フォールバックを使う。
 * @returns 衝突の可能性が極めて低い文字列 ID
 */
function generateToastId(): string {
	const c: Crypto | undefined =
		typeof crypto !== "undefined" ? crypto : undefined;
	if (c?.randomUUID) {
		return c.randomUUID();
	}
	if (c?.getRandomValues) {
		const bytes = new Uint8Array(16);
		c.getRandomValues(bytes);
		return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type UseToastsResult = {
	/** 現在表示中のトースト一覧 */
	toasts: ToastItem[];
	/**
	 * 新しいトーストを表示する
	 * @param message - 表示するメッセージ
	 * @param type - トーストの種類
	 */
	showToast: (message: string, type: ToastType) => void;
	/**
	 * 指定した ID のトーストを閉じる
	 * @param id - 閉じるトーストの ID
	 */
	dismissToast: (id: string) => void;
};

/**
 * App レベルでトースト状態を管理するフック。
 * @returns トースト配列と表示/クローズ関数
 */
export function useToasts(): UseToastsResult {
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const showToast = useCallback((message: string, type: ToastType) => {
		const id = generateToastId();
		setToasts((prev) => [...prev, { id, message, type }]);
	}, []);

	const dismissToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return { toasts, showToast, dismissToast };
}
