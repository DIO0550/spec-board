/**
 * ドラッグ操作中の各カードの上下端 Y 座標を表す。
 * `DOMRect` の top/bottom のみを抜き出した最小構造で、hover index 計算など
 * 純粋関数のテストでもインスタンス生成しやすい。
 */
export type DragCardRect = {
  readonly top: number;
  readonly bottom: number;
};
