type OptionSwatchProps = {
  /** swatch の CSS color 値（inline style の backgroundColor に渡す）。 */
  color: string;
};

/**
 * 色付きドット（swatch）。trigger / option の両方から利用する単一実装。
 * @param props - {@link OptionSwatchProps}
 * @returns swatch 要素
 */
export const OptionSwatch = ({ color }: OptionSwatchProps) => (
  <span
    className="size-2.5 shrink-0 rounded-full"
    style={{ backgroundColor: color }}
  />
);
