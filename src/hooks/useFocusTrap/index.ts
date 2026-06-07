import { type RefObject, useEffect, useRef } from "react";

/** useFocusTrap の引数 */
export type UseFocusTrapArgs = {
  /**
   * true の間だけ Tab フォーカスをコンテナ内に閉じ込める。
   * 上層ダイアログ表示中などは false にして二重トラップを避ける。
   */
  active: boolean;
};

/** コンテナ内のフォーカス可能要素のセレクタ（disabled / tabindex=-1 を除外） */
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(",");

// 現時点の簡易実装: focusable 判定は上記セレクタ（disabled / tabindex=-1 除外）のみで行い、
// hidden / aria-hidden / inert / CSS 非表示の追加除外は行わない。理由は 2 つ:
//  (1) 現状の DetailScreen 内に条件付き非表示の focusable 要素は無い（DetailFields は常時可視）。
//  (2) テスト環境 happy-dom はレイアウトを持たず offsetParent が常に null になりうるため、
//      offsetParent ベースの可視性フィルタを入れると本体テストが壊れる。
// 将来コンテナ内に hidden DOM を残す UI（popover 等）が増えた場合は、実フォーカス可能性で絞る
// getFocusableElements へ拡張する（別 Issue）。

/**
 * コンテナ内に Tab フォーカスを循環させる focus trap hook。
 * active=true の間、Tab で末尾→先頭、Shift+Tab で先頭→末尾へラップする。
 * hook 自身がコンテナ要素の ref を生成・所有し、それを返す。呼び出し側は
 * 返り値の ref をトラップ対象要素に `ref={containerRef}` で取り付けるだけでよい。
 * @typeParam T - コンテナ要素の型（既定 HTMLElement）
 * @param args - {@link UseFocusTrapArgs}
 * @returns トラップ対象要素に取り付ける ref（`RefObject<T | null>`）
 */
export const useFocusTrap = <T extends HTMLElement = HTMLElement>(
  args: UseFocusTrapArgs,
): RefObject<T | null> => {
  const { active } = args;
  // hook 自身が ref を所有する（呼び出し側に作らせない）
  const containerRef = useRef<T | null>(null);
  useEffect(() => {
    if (!active) {
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    /**
     * Tab / Shift+Tab を捕捉し、フォーカスをコンテナ内へ循環させる。
     * @param e - keydown イベント
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") {
        return;
      }
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      // フォーカス可能要素が無ければコンテナ自身に留める
      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      // フォーカスがコンテナ自身（tabIndex=-1）や外部にある状態で Tab を押すと、
      // first/last いずれにも一致せず素通りして背後へ抜ける。初回 Tab の貫通を防ぐため、
      // コンテナ内の focusable 上に無い場合は端へ引き込む。
      const isOnFocusable =
        activeEl instanceof HTMLElement && focusables.includes(activeEl);
      if (!isOnFocusable) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
        return;
      }
      if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);
  return containerRef;
};
