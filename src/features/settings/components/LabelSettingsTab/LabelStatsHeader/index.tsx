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
    <div className="flex items-center justify-between">
      <h2 className="flex items-baseline gap-3 text-lg font-semibold text-slate-800">
        ラベル
        <span className="text-xs font-normal text-muted">
          {total} 件 · {used} 使用中 · {unused} 未使用
        </span>
      </h2>
      <button
        type="button"
        onClick={onExport}
        disabled={isExportDisabled}
        className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-50"
      >
        ⬇ エクスポート
      </button>
    </div>
  );
};
