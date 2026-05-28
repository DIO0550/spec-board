type WarningIconProps = {
  /** aria-label と `<title>` のテキスト。デフォルト "リンク切れあり"。 */
  readonly label?: string;
  /** SVG の width / height（px）。デフォルト 16。 */
  readonly size?: number;
  /** 追加クラス。デフォルト "text-yellow-500"。 */
  readonly className?: string;
};

/**
 * リンク切れ警告用の inline SVG アイコン。
 * `role="img"` + `aria-label` + `<title>` でスクリーンリーダ向けに代替テキストを提供する。
 *
 * @param props - {@link WarningIconProps}
 * @returns warning triangle 形状の SVG
 */
export const WarningIcon = (props: WarningIconProps) => {
  const label = props.label ?? "リンク切れあり";
  const size = props.size ?? 16;
  const className = props.className ?? "text-yellow-500";
  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="warning-icon"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <title>{label}</title>
      <path d="M12 2L1 21h22L12 2zm0 5l8.5 14h-17L12 7zm-1 5v4h2v-4h-2zm0 5v2h2v-2h-2z" />
    </svg>
  );
};
