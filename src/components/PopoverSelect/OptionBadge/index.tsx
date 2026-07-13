type OptionBadgeProps = {
  /** badge に表示するテキスト。 */
  label: string;
  /** 配色などの追加クラス（呼び出し側供給の動的値）。 */
  badgeClassName: string;
};

/**
 * 色付き badge ピル。trigger / option の両方から利用する単一実装。
 * @param props - {@link OptionBadgeProps}
 * @returns badge 要素
 */
export const OptionBadge = ({ label, badgeClassName }: OptionBadgeProps) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClassName}`}
  >
    {label}
  </span>
);
