import type {
  SortKey,
  StateFilter,
} from "@/features/milestoneView/lib/listOps";

/** 一覧 / ロードマップの 2 ビュー切替。 */
export type ViewMode = "list" | "roadmap";

type MilestoneToolbarProps = {
  /** 現在の状態フィルタ */
  filter: StateFilter;
  /**
   * 状態フィルタ変更時に呼ばれる。
   * @param next - 新しい状態フィルタ値
   */
  onFilterChange: (next: StateFilter) => void;
  /** 検索クエリ（部分一致・空文字で全件） */
  query: string;
  /**
   * クエリ変更時に呼ばれる。
   * @param next - 新しいクエリ文字列
   */
  onQueryChange: (next: string) => void;
  /** 現在のソートキー */
  sort: SortKey;
  /**
   * ソート変更時に呼ばれる。
   * @param next - 新しいソートキー
   */
  onSortChange: (next: SortKey) => void;
  /** 現在のビューモード */
  view: ViewMode;
  /**
   * ビューモード切替時に呼ばれる。
   * @param next - 新しいビューモード
   */
  onViewChange: (next: ViewMode) => void;
};

/** フィルター pill のラベル定義（design 表示順）。 */
const FILTERS: readonly { value: StateFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "open", label: "オープン" },
  { value: "overdue", label: "期限超過" },
  { value: "closed", label: "クローズ済" },
];

/** ソート選択肢。 */
const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "due", label: "期日順" },
  { value: "progress", label: "進捗順" },
  { value: "name", label: "名前順" },
];

/** ビュー切替（list / roadmap）の選択肢。 */
const VIEWS: readonly { value: ViewMode; label: string; icon: string }[] = [
  { value: "list", label: "一覧", icon: "≡" },
  { value: "roadmap", label: "ロードマップ", icon: "▦" },
];

/**
 * マイルストーン画面のツールバー。フィルター pills + 検索 + ソート + ビュー切替。
 * design-source: `.toolbar`（ms-static-list/roadmap 共通）。
 * @param props - {@link MilestoneToolbarProps}
 * @returns ツールバー要素
 */
export const MilestoneToolbar = ({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: MilestoneToolbarProps) => {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2">
      <div className="flex items-center gap-1">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              data-testid={`milestone-filter-${f.value}`}
              aria-pressed={active}
              onClick={() => onFilterChange(f.value)}
              className={[
                "rounded-full border px-3 py-1 text-xs transition",
                active
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-transparent text-muted hover:border-border",
              ].join(" ")}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <label className="ml-auto flex items-center gap-2 rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
        <span aria-hidden="true">🔍</span>
        <input
          type="search"
          data-testid="milestone-search-input"
          aria-label="マイルストーンを検索"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="マイルストーンを検索"
          className="w-44 bg-transparent text-foreground outline-none placeholder:text-text-dim"
        />
      </label>

      <div className="flex items-center gap-1 rounded-md border border-border bg-panel-2 p-0.5">
        {SORTS.map((s) => {
          const active = sort === s.value;
          return (
            <button
              key={s.value}
              type="button"
              data-testid={`milestone-sort-${s.value}`}
              aria-pressed={active}
              onClick={() => onSortChange(s.value)}
              className={[
                "rounded px-2 py-1 text-xs transition",
                active
                  ? "bg-panel text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 rounded-md border border-border bg-panel-2 p-0.5">
        {VIEWS.map((v) => {
          const active = view === v.value;
          return (
            <button
              key={v.value}
              type="button"
              data-testid={`milestone-view-${v.value}`}
              aria-pressed={active}
              aria-label={v.label}
              onClick={() => onViewChange(v.value)}
              className={[
                "rounded px-2 py-1 text-sm transition",
                active
                  ? "bg-panel text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              {v.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
};
