import { WarningIcon } from "@/components/WarningIcon";

type BrokenParentRowProps = {
  /** リンク切れと判定された parent の raw path 文字列 */
  readonly parentFilePath: string;
};

/**
 * DetailPanel の parent 行。参照先 Task が一覧に存在しない（リンク切れ）場合に表示する。
 * 取消線スタイルの path 文字列と {@link WarningIcon} + 「リンク切れ」テキストを並べる。
 *
 * @param props - {@link BrokenParentRowProps}
 * @returns parent リンク切れ行
 */
export const BrokenParentRow = ({ parentFilePath }: BrokenParentRowProps) => {
  return (
    <div
      data-testid="broken-parent-row"
      className="flex items-center gap-1.5 text-xs text-gray-500"
    >
      <WarningIcon size={14} />
      <span className="text-yellow-700">リンク切れ</span>
      <span className="truncate text-gray-500 line-through">
        {parentFilePath}
      </span>
    </div>
  );
};
