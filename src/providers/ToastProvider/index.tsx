import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ToastContainer } from "@/components/ToastContainer";
import { registerToastSink } from "@/lib/tauri";
import type { ToastItem, ToastType } from "@/types/toast";
import {
  type ToastDispatch,
  ToastDispatchContext,
  type ToastState,
  ToastStateContext,
} from "./context";

export { useToastDispatch, useToastState, useToasts } from "./context";

/**
 * トースト ID を生成する。
 * happy-dom / Tauri WebView ともに crypto.randomUUID を提供するためフォールバックは
 * 持たず、衰退環境では throw して fail-fast する。
 * @throws crypto.randomUUID 未提供環境
 * @returns トースト 1 件分のユニーク ID
 */
const generateToastId = (): string => crypto.randomUUID();

/** ToastProvider の Props。 */
type ToastProviderProps = {
  /** Context を供給する子要素。`<ToastContainer />` は children の外側で内蔵描画する */
  children: ReactNode;
};

/**
 * Toast 状態（toasts / showToast / dismissToast）+ React tree 外からの注入経路
 * (`registerToastSink`) + `<ToastContainer />` の描画を Context 配下に集約する Provider。
 *
 * state と dispatch を別 Context に分離することで、`showToast` だけを使う consumer は
 * toasts 変化で再 render されない。利用側は `useToastDispatch()`（dispatch のみ）か
 * `useToastState()`（toasts のみ）、両方欲しい場合は `useToasts()` を呼ぶ。
 *
 * @param props - {@link ToastProviderProps}
 * @returns Provider 要素
 */
export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = generateToastId();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // invokeWrapped 層の失敗トーストを Provider の showToast に橋渡しする。
  // register が返す guarded cleanup を return することで、StrictMode 二重マウントや
  // 再生成時の stale cleanup（他 sink を誤って消す）を防ぐ。
  useEffect(() => registerToastSink(showToast), [showToast]);

  // dispatch は showToast / dismissToast がどちらも useCallback([]) で stable なため、
  // useMemo の依存配列も安定して Provider lifetime 内で完全に不変になる。
  const dispatch = useMemo<ToastDispatch>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );
  // state は toasts の参照そのものを value に詰めるだけで十分（追加 wrapper 不要）。
  const state = useMemo<ToastState>(() => ({ toasts }), [toasts]);

  return (
    <ToastDispatchContext.Provider value={dispatch}>
      <ToastStateContext.Provider value={state}>
        {children}
        <ToastContainer />
      </ToastStateContext.Provider>
    </ToastDispatchContext.Provider>
  );
};
