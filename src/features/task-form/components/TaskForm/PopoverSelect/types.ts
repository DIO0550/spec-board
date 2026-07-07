/** popover select の選択肢 1 件。 */
export type PopoverSelectOption = {
  /** onChange に渡す値 */
  value: string;
  /** trigger / option に表示するテキスト */
  label: string;
  /** swatch（status の色付きドット）の CSS color 値。 */
  swatchColor?: string;
  /** option / trigger を badge 表示にする場合の追加クラス（優先度の配色など）。 */
  badgeClassName?: string;
};
