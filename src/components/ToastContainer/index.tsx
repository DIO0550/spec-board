import { Toast } from "@/components/Toast";
// 循環参照を避けるため、index.tsx ではなく context.ts から直接 import する。
// 公開 import path (`@/providers/ToastProvider`) は index.tsx の re-export 経由で機能するが、
// Container は Provider と同じパッケージ内のため deeper path で直接参照して循環を切る。
import { useToasts } from "@/providers/ToastProvider/context";

/**
 * 複数のトーストを画面右上に縦スタックで描画するコンテナ。
 * toasts / dismiss は `useToasts()` (Context) から取得する。toasts が空なら何も描画しない。
 *
 * `<ToastProvider>` が children の外側で本コンポーネントを内蔵描画するため、
 * 呼び出し側が直接マウントする必要はない。Storybook の story も ToastProvider decorator
 * 配下に Story を置けば Provider が内蔵 Container を描画する。
 *
 * @returns コンテナ要素、または null
 */
export const ToastContainer = () => {
  const { toasts, dismissToast } = useToasts();
  if (toasts.length === 0) {
    return null;
  }
  return (
    // z-[80]=トースト。z 階層全体で最前面に置き、ダイアログ（z-[70]）表示中でも通知を隠さない。
    // 取り決めは src/index.css を参照。
    <div
      className="pointer-events-none fixed top-4 right-4 z-[80] flex flex-col gap-2"
      data-testid="toast-container"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} onDismiss={dismissToast} />
        </div>
      ))}
    </div>
  );
};
