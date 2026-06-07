/** TabNav が扱うタブ 1 件（表示用データのみ）。 */
export type TabItem = {
  /** タブ識別子（一意・DOM id に使う ASCII slug） */
  id: string;
  /** タブに表示するラベル文言 */
  label: string;
};

/**
 * tab ボタンの DOM id を組み立てる（tabpanel 側と共有する規約）。
 * @param prefix - 用途を区別する接頭辞（例 "board-view"）
 * @param tabId - タブ ID
 * @returns tab 要素の DOM id
 */
export const tabNavTabId = (prefix: string, tabId: string): string =>
  `${prefix}-tab-${tabId}`;

/**
 * tabpanel の DOM id を組み立てる（描画側と共有する規約）。
 * @param prefix - 用途を区別する接頭辞
 * @param tabId - タブ ID
 * @returns tabpanel 要素の DOM id
 */
export const tabNavPanelId = (prefix: string, tabId: string): string =>
  `${prefix}-panel-${tabId}`;

/** TabNav の Props。 */
type TabNavProps = {
  /** タブ一覧（1 件でもタブ UI を表示する。配列は変更しないため readonly） */
  tabs: readonly TabItem[];
  /** 現在アクティブなタブ ID */
  activeTabId: string;
  /** DOM id / tabpanel 紐付けに使う接頭辞 */
  idPrefix: string;
  /** tablist 全体の説明（任意） */
  ariaLabel?: string;
  /**
   * タブ選択ハンドラ。
   * @param tabId - 選択されたタブ ID
   */
  onSelect: (tabId: string) => void;
};

/**
 * WAI-ARIA Tabs パターンのサブナビゲーション（汎用）。設定サブナビ・ボードの
 * ビュー切替など、複数 feature で再利用する。キーボード操作は将来対応。
 * @param props - {@link TabNavProps}
 * @returns tablist 要素
 */
export const TabNav = ({
  tabs,
  activeTabId,
  idPrefix,
  ariaLabel,
  onSelect,
}: TabNavProps) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 border-b border-border"
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
                ? "border-b-2 border-accent px-3 py-2 text-sm text-accent"
                : "px-3 py-2 text-sm text-muted hover:bg-surface-muted"
            }
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
