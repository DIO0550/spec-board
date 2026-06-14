import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef } from "react";
import { computePreviewWidth } from "@/features/task-form/lib/computePreviewWidth";

type PreviewResizerProps = {
  /**
   * ドラッグ中の確定幅（px）を親へ通知する。親が幅 state を保持する。
   * @param widthPx - clamp 済みのプレビュー幅
   */
  onWidthChange: (widthPx: number) => void;
};

/** drag 中に body へ付与するクラス（col-resize カーソル + テキスト選択抑止）。 */
const RESIZING_CLASS = "resizing-x";

/**
 * プレビュー幅を変えるドラッグハンドル（純新規・流用元なし）。
 * pointerdown で capture を取り、pointermove で `computePreviewWidth` により幅を算出して
 * 親へ通知する。pointerup / pointercancel で drag を終了し、以降は通知しない。
 * drag 中は body に `resizing-x` を付けて col-resize カーソルとテキスト選択抑止を効かせる。
 *
 * a11y: WAI-ARIA の window splitter（role="separator"）が理想だが、Biome の
 * useSemanticElements が separator role を <hr> へ誘導し focusable splitter を表現できない
 * ため、focusable な button にポインタ操作を載せて代替する（幅はキーボードでも pvToggle 等の
 * 別経路で操作可能）。
 * @param props - {@link PreviewResizerProps}
 * @returns リサイズハンドル要素
 */
export const PreviewResizer = (props: PreviewResizerProps) => {
  const draggingRef = useRef(false);

  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    if (typeof e.currentTarget.releasePointerCapture === "function") {
      // capture を取得していない環境（happy-dom 等）でも例外にしない。
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // capture 未取得時の release は無視する。
      }
    }
    document.body.classList.remove(RESIZING_CLASS);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    draggingRef.current = true;
    if (typeof e.currentTarget.setPointerCapture === "function") {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // capture 非対応環境では掴み損ねても move 自体は機能する。
      }
    }
    document.body.classList.add(RESIZING_CLASS);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) {
      return;
    }
    props.onWidthChange(
      computePreviewWidth({
        clientX: e.clientX,
        viewportWidth: window.innerWidth,
      }),
    );
  };

  return (
    <button
      type="button"
      aria-label="プレビュー幅を変更"
      title="ドラッグで幅を変更"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group relative cursor-col-resize touch-none select-none border-0 bg-transparent p-0 outline-none focus-visible:bg-accent"
      data-testid="preview-resizer"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-[3px] right-[3px] bg-border group-hover:bg-accent"
      />
    </button>
  );
};
