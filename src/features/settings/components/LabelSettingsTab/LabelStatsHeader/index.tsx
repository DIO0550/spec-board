type LabelStatsHeaderProps = {
  /** 総数 */
  total: number;
  /** 使用中 */
  used: number;
  /** 未使用 */
  unused: number;
  /** エクスポート実行中 / 他 mutation 実行中で disable */
  isExportDisabled: boolean;
  /** エクスポートボタンクリック */
  onExport: () => void;
};

/**
 * ラベル設定タブの上部統計ヘッダー（「N 件 / M 使用中 / K 未使用」+ エクスポートボタン）。
 * @param props - {@link LabelStatsHeaderProps}
 * @returns ヘッダー要素
 */
export const LabelStatsHeader = ({
  total,
  used,
  unused,
  isExportDisabled,
  onExport,
}: LabelStatsHeaderProps) => {
  return (
    <header className="flex flex-wrap items-end gap-4">
      <h1 className="m-0 flex items-baseline gap-4 text-[22px] font-semibold text-foreground">
        ラベル
        <span className="flex gap-4 pb-1 text-xs font-normal text-muted">
          <span>
            <strong className="font-mono text-foreground">{total}</strong> 件
          </span>
          <span>
            <strong className="font-mono text-foreground">{used}</strong> 使用中
          </span>
          <span>
            <strong className="font-mono text-foreground">{unused}</strong>{" "}
            未使用
          </span>
        </span>
      </h1>
      <button
        type="button"
        onClick={onExport}
        disabled={isExportDisabled}
        className="ml-auto h-7 rounded-md border border-border bg-surface-muted px-2.5 text-xs font-medium disabled:opacity-50"
      >
        エクスポート
      </button>
    </header>
  );
};
