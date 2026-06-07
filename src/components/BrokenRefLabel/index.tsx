import { WarningIcon } from "@/components/WarningIcon";

type BrokenRefLabelProps = {
  /** リンク切れと判定された raw path 文字列。取消線スタイルで表示する。 */
  readonly rawPath: string;
  /**
   * 取消線 path span に付与する `data-testid`。
   * テストで「line-through が当たっている span」を直接捉えたい場合に指定する。
   */
  readonly pathTestId?: string;
};

/**
 * WarningIcon + 「リンク切れ」テキスト + 取消線 path を並べる共通プリミティブ。
 * DetailPanel の parent / links / reverseLinks / children のリンク切れ行で再利用する。
 * 行の枠 (`<li>` / `<div>` 等) と layout 用クラスは呼出元で wrap する。
 *
 * @param props - {@link BrokenRefLabelProps}
 * @returns 警告アイコン + ラベル + 取消線 path の span 群
 */
export const BrokenRefLabel = ({
  rawPath,
  pathTestId,
}: BrokenRefLabelProps) => {
  return (
    <>
      <WarningIcon size={14} />
      <span className="text-xs text-yellow-700">リンク切れ</span>
      <span
        data-testid={pathTestId}
        className="min-w-0 flex-1 truncate text-muted line-through"
      >
        {rawPath}
      </span>
    </>
  );
};
