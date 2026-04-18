export type ToastType = "success" | "error" | "warning";

export type ToastItem = {
	id: string;
	message: string;
	type: ToastType;
};

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
