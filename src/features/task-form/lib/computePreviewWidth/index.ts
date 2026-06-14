/** プレビュー幅の下限（px）。デザインの MIN_W に一致。 */
const MIN_WIDTH = 340;

/** プレビュー幅の上限割合（viewport 幅に対する比率）。デザインの MAX_FRAC に一致。 */
const MAX_FRACTION = 0.62;

/** {@link computePreviewWidth} の入力。 */
export type ComputePreviewWidthInput = {
  /** ポインタの clientX（画面左端からの距離）。 */
  clientX: number;
  /** viewport の幅（px）。テストで注入できるよう引数化する。 */
  viewportWidth: number;
};

/**
 * リサイズハンドルのポインタ位置からプレビューペインの確定幅を算出する。
 * 右ペインは viewport 右端からの距離で幅が決まるため `viewportWidth - clientX` を基準にし、
 * 下限 340px / 上限 round(viewportWidth * 0.62) でクランプする。
 * @param input - {@link ComputePreviewWidthInput}
 * @returns クランプ済みのプレビュー幅（px）
 */
export const computePreviewWidth = (
  input: ComputePreviewWidthInput,
): number => {
  const max = Math.round(input.viewportWidth * MAX_FRACTION);
  const raw = input.viewportWidth - input.clientX;
  return Math.max(MIN_WIDTH, Math.min(max, raw));
};
