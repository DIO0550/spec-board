import type { ToastType } from "@/types/toast";

/** トースト発火関数の型（useToasts.showToast と同形）。 */
export type ToastSink = (message: string, type: ToastType) => void;

let sink: ToastSink | null = null;

/**
 * トースト sink を登録し、その登録を取り消す cleanup 関数を返す。
 * App の useEffect から `return registerToastSink(showToast)` の形で使う想定。
 *
 * 返す cleanup は「自分が登録した sink のときだけ」解除する。これにより、
 * 別の登録によって sink が差し替わった後に古い cleanup が呼ばれても、
 * 新しい sink を誤って消さない（複数 root / テスト並行実行での stale cleanup 対策）。
 *
 * @param fn 登録する sink
 * @returns この登録だけを解除する cleanup 関数
 */
export const registerToastSink = (fn: ToastSink): (() => void) => {
  sink = fn;
  return () => {
    if (sink === fn) {
      sink = null;
    }
  };
};

/**
 * 登録済み sink を無条件で解除する（主にテストの afterEach 用）。
 */
export const unregisterToastSink = (): void => {
  sink = null;
};

/**
 * 現在登録されている sink を返す。未登録なら null。
 * @returns 登録済み sink、または null
 */
export const getToastSink = (): ToastSink | null => sink;
