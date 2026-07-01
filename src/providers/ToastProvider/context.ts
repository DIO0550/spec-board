import { createContext, useContext } from "react";
import type { ToastItem, ToastType, UseToastsResult } from "@/types/toast";

/** ToastProvider が公開する dispatch ハンドラの組。 */
export type ToastDispatch = {
  /**
   * 新しいトーストを表示する。
   * @param message - 表示するメッセージ
   * @param type - トーストの種類
   */
  showToast: (message: string, type: ToastType) => void;
  /**
   * 指定 ID のトーストを閉じる。
   * @param id - 閉じるトーストの ID
   */
  dismissToast: (id: string) => void;
};

/** ToastProvider が公開する state（描画対象トースト一覧）。 */
export type ToastState = {
  toasts: ToastItem[];
};

// Provider 未提供時を null で表現し、フック側で early throw する規約に揃える。
// state と dispatch は変化頻度が大きく異なるため 2 本に分離する。
// dispatch は Provider lifetime 内で完全に不変、state は toasts の変化のたびに差し替わる。
// showToast だけを使う consumer（AppShell / TaskCreateScreen）は dispatch のみ subscribe して
// toasts 追加/削除のたびに再 render されないようにする。
export const ToastStateContext = createContext<ToastState | null>(null);
export const ToastDispatchContext = createContext<ToastDispatch | null>(null);

/**
 * Toast 状態のみ（toasts）を取得するフック。toasts の追加/削除で再 render される。
 * @throws ToastProvider の外で呼ばれた場合
 * @returns {@link ToastState}
 */
export const useToastState = (): ToastState => {
  const context = useContext(ToastStateContext);
  if (context === null) {
    throw new Error("useToastState は ToastProvider の内側で使用してください");
  }
  return context;
};

/**
 * Toast の dispatch ハンドラ（showToast / dismissToast）を取得するフック。
 * value は Provider lifetime 内で stable なので、これだけを subscribe する consumer は
 * toasts の変化で再 render されない。
 * @throws ToastProvider の外で呼ばれた場合
 * @returns {@link ToastDispatch}
 */
export const useToastDispatch = (): ToastDispatch => {
  const context = useContext(ToastDispatchContext);
  if (context === null) {
    throw new Error(
      "useToastDispatch は ToastProvider の内側で使用してください",
    );
  }
  return context;
};

/**
 * Toast の state と dispatch を 1 つの API で返す互換フック。
 * 両 Context を subscribe するため toasts 変化で再 render される。
 * 必要な部分だけ欲しい場合は {@link useToastState} / {@link useToastDispatch} を使う。
 * @throws ToastProvider の外で呼ばれた場合
 * @returns {@link UseToastsResult}
 */
export const useToasts = (): UseToastsResult => {
  // useToastState / useToastDispatch を経由すると throw メッセージが個別フック名になるため、
  // ここで直接 Context を読み「useToasts」を含む統一メッセージで throw する。
  const state = useContext(ToastStateContext);
  const dispatch = useContext(ToastDispatchContext);
  if (state === null || dispatch === null) {
    throw new Error("useToasts は ToastProvider の内側で使用してください");
  }
  return { toasts: state.toasts, ...dispatch };
};
