import { useEffect } from "react";

/** useEscToClose の引数 */
export type UseEscToCloseArgs = {
  /** true のとき Escape ハンドラを実行しない（subscribe は維持） */
  disabled: boolean;
  /** Escape キーが押された時に呼ばれるコールバック */
  onEscape: () => void;
};

/**
 * document の keydown を購読し、Escape キーで onEscape を呼ぶ hook。
 * disabled=true の間は Escape を無視する（panel 上層のダイアログが開いている時の抑止に使う）。
 *
 * @param args - disabled フラグと onEscape コールバック
 * @returns void
 */
export const useEscToClose = (args: UseEscToCloseArgs): void => {
  const { disabled, onEscape } = args;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) {
        onEscape();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onEscape]);
};
