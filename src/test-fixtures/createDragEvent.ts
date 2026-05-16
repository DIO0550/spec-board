/** createDragEvent が受け付ける DragEvent 種別。 */
export type DragEventType =
  | "dragstart"
  | "dragover"
  | "dragleave"
  | "drop"
  | "dragend";

/** createDragEvent のオプション。 */
export type CreateDragEventOptions = {
  readonly dataTransfer?: DataTransfer;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly bubbles?: boolean;
  readonly cancelable?: boolean;
};

/**
 * happy-dom 20 には DragEvent class が無いため、Event のサブクラスで代替する。
 * `dataTransfer` / `clientX` / `clientY` をインスタンスフィールドとして持たせる
 * ことで、`Object.defineProperty` 等の後付け注入が不要になる。
 */
export class DragLikeEvent extends Event {
  readonly dataTransfer: DataTransfer;
  readonly clientX: number;
  readonly clientY: number;

  /**
   * DragLikeEvent を構築する。
   * @param type DragEvent 種別
   * @param options 任意の dataTransfer / 座標 / propagation 設定
   */
  constructor(type: DragEventType, options: CreateDragEventOptions = {}) {
    super(type, {
      bubbles: options.bubbles ?? true,
      cancelable: options.cancelable ?? true,
    });
    this.dataTransfer = options.dataTransfer ?? new DataTransfer();
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 0;
  }
}

/**
 * テスト用の DragEvent 互換イベントを生成する thin factory。
 *
 * 使用例:
 * ```ts
 * const event = createDragEvent("dragstart");
 * event.dataTransfer.setData("application/x-spec-board-task", "tasks/a.md");
 * element.dispatchEvent(event);
 * ```
 *
 * @param type DragEvent 種別
 * @param options 任意の dataTransfer / 座標 / propagation 設定
 * @returns DragLikeEvent インスタンス
 */
export const createDragEvent = (
  type: DragEventType,
  options: CreateDragEventOptions = {},
): DragLikeEvent => new DragLikeEvent(type, options);
