import { useId } from "react";
import type {
  LabelGroupFilter,
  LabelSort,
} from "@/features/settings/lib/labelSettings/derive";

type GroupOption = {
  /** グループ名 */
  group: string;
  /** そのグループに属するラベル数 */
  count: number;
};

type LabelFilterBarProps = {
  /** 「すべて」の件数（総数） */
  totalCount: number;
  /** グループチップに並べる候補 */
  groupOptions: readonly GroupOption[];
  /** 現在のグループ絞り込み */
  groupFilter: LabelGroupFilter;
  /** 現在の検索キーワード */
  keyword: string;
  /** 現在のソートキー */
  sort: LabelSort;
  /**
   * グループ絞り込み変更ハンドラ。
   * @param next - 新しいグループ絞り込み
   */
  onGroupChange: (next: LabelGroupFilter) => void;
  /**
   * 検索キーワード変更ハンドラ。
   * @param next - 新しいキーワード
   */
  onKeywordChange: (next: string) => void;
  /**
   * ソート変更ハンドラ。
   * @param next - 新しいソートキー
   */
  onSortChange: (next: LabelSort) => void;
};

/** ソート選択肢の表示ラベル。 */
const SORT_LABELS: Readonly<Record<LabelSort, string>> = {
  name: "名前順",
  usage: "使用数",
  updated: "更新順",
};

/**
 * 「全てチップ」が選択中か判定する。
 * @param current - 現在の絞り込み
 * @returns 全件モード（`{ kind: "all" }`）なら true
 */
const isAllActive = (current: LabelGroupFilter): boolean =>
  current.kind === "all";

/**
 * 特定グループチップが選択中か判定する。
 * 実グループ名 "all" と「全てチップ」を文字列リテラルで混ぜないため、
 * 判別 union 構造で受け取った `kind === "group"` のときだけ value を比較する。
 * @param current - 現在の絞り込み
 * @param group - 判定対象の実グループ名
 * @returns 選択中なら true
 */
const isGroupActive = (current: LabelGroupFilter, group: string): boolean =>
  current.kind === "group" && current.value === group;

/**
 * グループチップ + 検索ボックス + ソート select を備えたフィルタバー。
 * グループは判別 union（{ kind: "all" } | { kind: "group"; value }）で表現する。
 * @param props - {@link LabelFilterBarProps}
 * @returns フィルタバー要素
 */
export const LabelFilterBar = ({
  totalCount,
  groupOptions,
  groupFilter,
  keyword,
  sort,
  onGroupChange,
  onKeywordChange,
  onSortChange,
}: LabelFilterBarProps) => {
  const keywordId = useId();
  const sortId = useId();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted">グループ</span>
      <button
        type="button"
        onClick={() => onGroupChange({ kind: "all" })}
        aria-pressed={isAllActive(groupFilter)}
        className={`rounded-full border px-2 py-0.5 text-xs ${
          isAllActive(groupFilter)
            ? "bg-accent text-accent-foreground"
            : "border-border"
        }`}
      >
        すべて {totalCount}
      </button>
      {groupOptions.map((opt) => (
        <button
          key={opt.group}
          type="button"
          onClick={() => onGroupChange({ kind: "group", value: opt.group })}
          aria-pressed={isGroupActive(groupFilter, opt.group)}
          className={`rounded-full border px-2 py-0.5 text-xs ${
            isGroupActive(groupFilter, opt.group)
              ? "bg-accent text-accent-foreground"
              : "border-border"
          }`}
        >
          {opt.group} {opt.count}
        </button>
      ))}
      <label htmlFor={keywordId} className="sr-only">
        ラベル名・説明で絞り込み
      </label>
      <div className="relative ml-auto">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 fill-none stroke-current text-text-dim [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.75]"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          id={keywordId}
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="ラベル名・説明で絞り込み..."
          className="w-64 rounded-full border border-border bg-surface-muted px-2 py-1 pl-7 text-sm focus:bg-surface"
        />
      </div>
      <fieldset
        id={sortId}
        className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-0.5 text-xs"
      >
        <legend className="sr-only">並び順</legend>
        {(Object.keys(SORT_LABELS) as LabelSort[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSortChange(key)}
            aria-pressed={sort === key}
            className={`rounded-full px-2 py-0.5 ${
              sort === key
                ? "bg-surface text-slate-900 shadow-sm"
                : "text-muted"
            }`}
          >
            {SORT_LABELS[key]}
          </button>
        ))}
      </fieldset>
    </div>
  );
};
