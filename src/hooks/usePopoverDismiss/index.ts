import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** usePopoverDismiss のオプション */
export type UsePopoverDismissOptions = {
  /** Esc / 外側クリックで閉じた直後に呼ばれる（任意）。 */
  onDismiss?: () => void;
};

/** usePopoverDismiss の戻り値 */
export type UsePopoverDismiss = {
  /** popover が開いているか */
  isOpen: boolean;
  /** 開く */
  open: () => void;
  /** 閉じる */
  close: () => void;
  /** 開閉を反転する */
  toggleOpen: () => void;
  /** trigger と popover を包む要素に付ける。外側判定の基準。 */
  containerRef: RefObject<HTMLDivElement | null>;
};

/**
 * popover の dismiss 制御（開閉 + Esc capture 非伝播 + 外側 mousedown）を束ねるフック。
 * open 中のみ Esc を capture フェーズで捕捉し stopPropagation するため、
 * 親フォームの「Esc で破棄確認」へ伝播しない（不変条件）。閉じている間はリスナーを
 * 張らないため、親側の Esc は通常どおり動く。
 * @param options - {@link UsePopoverDismissOptions}
 * @returns 開閉状態と操作、および container ref（{@link UsePopoverDismiss}）
 */
export const usePopoverDismiss = (
  options: UsePopoverDismissOptions = {},
): UsePopoverDismiss => {
  const { onDismiss } = options;
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    /**
     * 外側 mousedown で閉じる。container 内の mousedown は無視する。
     * @param e - mousedown イベント
     */
    const onMouseDown = (e: MouseEvent) => {
      const el = containerRef.current;
      if (el !== null && e.target instanceof Node && !el.contains(e.target)) {
        setIsOpen(false);
        onDismiss?.();
      }
    };
    /**
     * Esc を capture フェーズで捕捉して閉じ、親へ伝播させない。
     * @param e - keydown イベント
     */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsOpen(false);
        onDismiss?.();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, onDismiss]);

  /** popover を開く。 */
  const open = useCallback(() => setIsOpen(true), []);
  /** popover を閉じる。 */
  const close = useCallback(() => setIsOpen(false), []);
  /** popover の開閉を反転する。 */
  const toggleOpen = useCallback(() => setIsOpen((v) => !v), []);

  return { isOpen, open, close, toggleOpen, containerRef };
};
