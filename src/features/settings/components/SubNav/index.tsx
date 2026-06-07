import type { SettingsTab } from "../../types";

/**
 * tab ボタンの DOM id を組み立てる（tabpanel 側と共有する規約）
 * @param tabId - タブ ID
 * @returns tab 要素の DOM id
 */
export const subNavTabId = (tabId: string) => `settings-tab-${tabId}`;
/**
 * tabpanel の DOM id を組み立てる（SettingsScreen 側と共有する規約）
 * @param tabId - タブ ID
 * @returns tabpanel 要素の DOM id
 */
export const subNavPanelId = (tabId: string) => `settings-panel-${tabId}`;

/** SubNav の Props */
type SubNavProps = {
  /**
   * 表示するタブ一覧（1 件でもタブ UI を表示する）。
   * SubNav は配列を変更しないため readonly で受ける。
   * これにより `NonEmptySettingsTabs`（readonly タプル）の `SETTINGS_TABS` をそのまま渡せる。
   */
  tabs: readonly SettingsTab[];
  /** 現在アクティブなタブ ID */
  activeTabId: string;
  /**
   * タブ選択ハンドラ
   * @param tabId - 選択されたタブ ID
   */
  onSelect: (tabId: string) => void;
};

/**
 * 設定画面のサブナビゲーション（WAI-ARIA Tabs パターンのロール属性付与）。
 * タブが 1 枠でもタブ UI を表示する。キーボード操作はタブ複数化時の将来対応。
 * @param props - {@link SubNavProps}
 * @returns tablist 要素
 */
export const SubNav = ({ tabs, activeTabId, onSelect }: SubNavProps) => {
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={subNavTabId(tab.id)}
            aria-selected={isActive}
            aria-controls={subNavPanelId(tab.id)}
            onClick={() => onSelect(tab.id)}
            className={
              isActive
                ? "border-b-2 border-accent px-3 py-2 text-sm font-medium text-foreground"
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
