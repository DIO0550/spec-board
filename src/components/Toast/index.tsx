import { useEffect } from "react";
import type { ToastItem, ToastType } from "@/types/toast";

export const TOAST_DEFAULT_DURATION_MS = 3000;

const TYPE_STYLES: Record<
  ToastType,
  { frame: string; icon: string; path: string }
> = {
  success: {
    frame: "bg-green-600 text-white",
    icon: "bg-white/20",
    path: "M5 12l4 4L19 6",
  },
  error: {
    frame: "bg-red-600 text-white",
    icon: "bg-white/20",
    path: "M6 6l12 12M18 6L6 18",
  },
  warning: {
    frame: "bg-yellow-500 text-gray-900",
    icon: "bg-black/10",
    path: "M12 8v5m0 3h.01",
  },
};

type ToastProps = {
  toast: ToastItem;
  /**
   * トーストを閉じるcallback。
   * @param id - 閉じるトーストの ID
   */
  onDismiss: (id: string) => void;
  duration?: number;
};

/** 320px幅のicon/message/closeを持つ通知。 */
export const Toast = ({
  toast,
  onDismiss,
  duration = TOAST_DEFAULT_DURATION_MS,
}: ToastProps) => {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, duration]);

  const styles = TYPE_STYLES[toast.type];
  const isError = toast.type === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-testid={`toast-${toast.type}`}
      data-toast-id={toast.id}
      className={`flex w-[320px] items-start gap-3 rounded-[10px] p-3 text-sm shadow-lg ${styles.frame}`}
    >
      <span
        aria-hidden="true"
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d={styles.path} />
        </svg>
      </span>
      <span className="min-w-0 flex-1 py-1 font-medium leading-5">
        {toast.message}
      </span>
      <button
        type="button"
        aria-label="閉じる"
        onClick={() => onDismiss(toast.id)}
        className="rounded p-1 opacity-75 transition hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
};
