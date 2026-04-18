import { useCallback, useState } from "react";
import type { ToastItem, ToastType, UseToastsResult } from "@/types/toast";

/**
 * トースト ID を生成する。
 * crypto.randomUUID が使える環境ではそれを使い、未対応環境では
 * crypto.getRandomValues を使った簡易フォールバックを使う。
 * @returns 衝突の可能性が極めて低い文字列 ID
 */
const generateToastId = (): string => {
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
};

/**
 * App レベルでトースト状態を管理するフック。
 * @returns トースト配列と表示/クローズ関数
 */
export const useToasts = (): UseToastsResult => {
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const showToast = useCallback((message: string, type: ToastType) => {
		const id = generateToastId();
		setToasts((prev) => [...prev, { id, message, type }]);
	}, []);

	const dismissToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return { toasts, showToast, dismissToast };
};
