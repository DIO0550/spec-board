/** TabNav が扱うタブ 1 件。 */
export type TabItem = {
  /** タブ識別子。 */
  id: string;
  /** 表示ラベル。 */
  label: string;
  /** 任意の件数pill。 */
  count?: number;
};

/**
 * tab buttonのDOM idを返す。
 * @param prefix - 用途を区別する接頭辞
 * @param tabId - タブID
 * @returns tab要素のDOM id
 */
export const tabNavTabId = (prefix: string, tabId: string): string =>
  `${prefix}-tab-${tabId}`;

/**
 * tabpanelのDOM idを返す。
 * @param prefix - 用途を区別する接頭辞
 * @param tabId - タブID
 * @returns tabpanel要素のDOM id
 */
export const tabNavPanelId = (prefix: string, tabId: string): string =>
  `${prefix}-panel-${tabId}`;

type TabNavProps = {
  /** タブ一覧。 */
  tabs: readonly TabItem[];
  /** アクティブなタブID。 */
  activeTabId: string;
  /** DOM idの接頭辞。 */
  idPrefix: string;
  /** tablistの説明。 */
  ariaLabel?: string;
  /**
   * タブ選択ハンドラ。
   * @param tabId - 選択されたタブID
   */
  onSelect: (tabId: string) => void;
};

/**
 * 44px subbarとして描画するWAI-ARIA tabs。
 * @param props - {@link TabNavProps}
 * @returns tablist要素
 */
export const TabNav = ({
  tabs,
  activeTabId,
  idPrefix,
  ariaLabel,
  onSelect,
}: TabNavProps) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className="flex h-11 shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-border bg-surface px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {tabs.map((tab) => {
      const isActive = tab.id === activeTabId;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={tabNavTabId(idPrefix, tab.id)}
          aria-selected={isActive}
          aria-controls={tabNavPanelId(idPrefix, tab.id)}
          onClick={() => onSelect(tab.id)}
          className={
            isActive
              ? "flex shrink-0 items-center gap-1.5 border-b-2 border-accent px-3 text-xs font-medium text-foreground"
              : "flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-xs font-medium text-muted hover:text-foreground"
          }
        >
          <span>{tab.label}</span>
          {tab.count !== undefined && (
            <span
              data-tab-count
              className="rounded-full border border-border bg-bg px-1.5 py-px font-mono text-[10.5px] leading-[1.4] text-muted"
            >
              {tab.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
