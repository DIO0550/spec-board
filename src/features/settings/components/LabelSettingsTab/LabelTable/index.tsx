import type { LabelDefinition, LabelName } from "@/domains/label-definition";
import { LabelRegistry } from "@/domains/label-registry";
import { resolveLabelSwatchStyle } from "@/features/settings/lib/labelSettings/swatch";
import { formatRelativeTime } from "@/utils/relativeTime";

type LabelTableProps = {
  /** 表示するラベル（フィルタ/ソート適用後） */
  labels: readonly LabelDefinition[];
  /** ラベル名 → 使用数 */
  usageCounts: Record<string, number>;
  /** mutation 実行中（編集・削除ボタン disable に使う） */
  isPending: boolean;
  /**
   * 相対時刻表示の基準時刻。親で 1 個だけ生成して全行で共有することで、行ごとに
   * `new Date()` を生成するコストと、行間で基準時刻が微妙にずれて表記がブレる
   * 問題（同じ render 内なのに「1分前」「2分前」が混在）を防ぐ。
   */
  now: Date;
  /**
   * 使用数リンククリック。
   * @param name - クリックされたラベル名
   */
  onUsageClick: (name: string) => void;
  /**
   * 編集アイコンクリック。
   * @param label - 編集対象のラベル定義
   */
  onEdit: (label: LabelDefinition) => void;
  /**
   * 削除アイコンクリック。
   * @param name - 削除対象のラベル名
   */
  onDelete: (name: LabelName) => void;
};

/**
 * 表示用のグループ名を返す（domain companion `LabelRegistry.effectiveGroup` に委譲）。
 * スワッチ色解決・derive 集計と同じグループ判定ロジックを使うことで、バッジ色とバッジ名の
 * 整合を保つ。
 * @param label - ラベル定義
 * @returns グループ名（badge 表示用）
 */
const displayGroup = (label: LabelDefinition): string =>
  LabelRegistry.effectiveGroup(label);

/**
 * ラベル一覧テーブル。色スワッチ chip / 説明 / 使用数（リンク or 0件） / グループ badge /
 * 更新（相対時刻、`updated` 無しは「新規」） / hover で見える編集・削除アクション。
 * @param props - {@link LabelTableProps}
 * @returns テーブル要素
 */
export const LabelTable = ({
  labels,
  usageCounts,
  isPending,
  now,
  onUsageClick,
  onEdit,
  onDelete,
}: LabelTableProps) => {
  if (labels.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted">
        条件に一致するラベルがありません
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="grid grid-cols-[140px_1fr_88px_88px_88px_72px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted">
        <div>ラベル</div>
        <div>説明</div>
        <div>使用数</div>
        <div>グループ</div>
        <div>更新</div>
        <div className="sr-only">アクション</div>
      </div>
      <ul>
        {labels.map((label) => {
          const count = usageCounts[label.name] ?? 0;
          return (
            <li
              key={label.name}
              data-testid="label-row"
              className="group grid grid-cols-[140px_1fr_88px_88px_88px_72px] items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
            >
              <div>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                  style={resolveLabelSwatchStyle(label)}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 rounded-full bg-current"
                  />
                  {label.name}
                </span>
              </div>
              <div className="truncate text-muted">
                {label.description ?? ""}
              </div>
              <div>
                {count > 0 ? (
                  <button
                    type="button"
                    onClick={() => onUsageClick(label.name)}
                    className="text-accent underline-offset-2 hover:underline"
                    data-testid="label-usage-link"
                  >
                    {count} 件
                  </button>
                ) : (
                  <span className="text-muted">0 件</span>
                )}
              </div>
              <div>
                <span className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-muted">
                  {displayGroup(label)}
                </span>
              </div>
              <div className="text-xs text-muted">
                {label.updated === undefined
                  ? "新規"
                  : formatRelativeTime(label.updated, now)}
              </div>
              <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  aria-label={`${label.name} を編集`}
                  title="編集"
                  disabled={isPending}
                  onClick={() => onEdit(label)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded border-none bg-transparent text-muted hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`${label.name} を削除`}
                  title="削除"
                  disabled={isPending}
                  onClick={() => onDelete(label.name)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded border-none bg-transparent text-muted hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
