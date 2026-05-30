type ParseErrorIconProps = {
  /** aria-label と `<title>` のテキスト。デフォルト "パースエラーあり"。 */
  readonly label?: string;
  /** SVG の width / height（px）。デフォルト 16。 */
  readonly size?: number;
  /** 追加クラス。デフォルト "text-red-500"。 */
  readonly className?: string;
};

/**
 * フロントマターのパースエラー警告用の inline SVG アイコン（赤系）。
 * `role="img"` + `aria-label` + `<title>` でスクリーンリーダ向けに代替テキストを提供する。
 * リンク切れ黄アイコン（`WarningIcon`）と同一カードで併存できるよう、
 * `data-testid="parse-error-icon"` と既定色 `text-red-500` で区別する。
 *
 * @param props - {@link ParseErrorIconProps}
 * @returns warning triangle 形状の赤い SVG
 */
export const ParseErrorIcon = ({
  label = "パースエラーあり",
  size = 16,
  className = "text-red-500",
}: ParseErrorIconProps) => {
  return (
    <svg
      role="img"
      aria-label={label}
      data-testid="parse-error-icon"
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
