import { Toast } from "@/components/Toast";
import type { ToastItem } from "@/types/toast";

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
export const ToastContainer = ({
  toasts,
  onDismiss,
  duration,
}: ToastContainerProps) => {
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
};
