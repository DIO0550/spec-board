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
  /** 表示するフィルター件数。 */
  filterCounts?: Partial<Record<StateFilter, number>>;
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
  { value: "closed", label: "クローズ" },
];

/** ソート選択肢。 */
const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "order", label: "既定順" },
  { value: "due", label: "期日順" },
  { value: "progress", label: "進捗順" },
  { value: "name", label: "名前順" },
];

/** ビュー切替（list / roadmap）の選択肢。 */
const VIEWS: readonly { value: ViewMode; label: string }[] = [
  { value: "list", label: "一覧" },
  { value: "roadmap", label: "ロードマップ" },
];

type ViewIconProps = {
  view: ViewMode;
};

const ViewIcon = ({ view }: ViewIconProps) => {
  if (view === "list") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.75]"
      >
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.75]"
    >
      <path d="M3 7h6M3 12h12M3 17h9M21 7l-3 3 3 3" />
    </svg>
  );
};
/**
 * マイルストーン画面のツールバー。フィルター pills + 検索 + ソート + ビュー切替。
 * design-source: `.toolbar`（ms-static-list/roadmap 共通）。
 * @param props - {@link MilestoneToolbarProps}
 * @returns ツールバー要素
 */
export const MilestoneToolbar = ({
  filter,
  filterCounts,
  onFilterChange,
  query,
  onQueryChange,
  sort,
  onSortChange,
  view,
  onViewChange,
}: MilestoneToolbarProps) => {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">
        状態
      </span>
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
                "rounded-full border px-2 py-0.5 text-[11px] transition",
                f.value === "overdue" ? "spec-ms-advanced-control" : "",
                active
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-border bg-background text-muted hover:border-accent",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {f.label}{" "}
              <span className="font-mono text-[10.5px] opacity-60">
                {filterCounts?.[f.value] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border-strong" />
      <label className="flex min-w-[200px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0 fill-none stroke-current text-text-dim [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.75]"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          data-testid="milestone-search-input"
          aria-label="マイルストーンを検索"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="マイルストーン名・説明で絞り込み..."
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted"
        />
      </label>

      <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
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
                "rounded px-2.5 py-1 text-xs transition",
                s.value === "order" ? "spec-ms-advanced-control" : "",
                active
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
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
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              ].join(" ")}
            >
              <ViewIcon view={v.value} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
