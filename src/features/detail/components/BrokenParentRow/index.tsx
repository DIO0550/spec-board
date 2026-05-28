import { BrokenRefLabel } from "@/components/BrokenRefLabel";

type BrokenParentRowProps = {
  /** リンク切れと判定された parent の raw path 文字列 */
  readonly parentFilePath: string;
};

/**
 * DetailPanel の parent 行。参照先 Task が一覧に存在しない（リンク切れ）場合に表示する。
 * 共通プリミティブ {@link BrokenRefLabel} を flex row でラップした薄いレイアウトのみ提供する。
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
      <BrokenRefLabel rawPath={parentFilePath} />
    </div>
  );
};
