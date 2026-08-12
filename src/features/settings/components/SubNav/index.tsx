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
  /** 設定画面から戻るaction。 */
  onBack?: () => void;
};

/**
 * 設定画面のサブナビゲーション（WAI-ARIA Tabs パターンのロール属性付与）。
 * タブが 1 枠でもタブ UI を表示する。キーボード操作はタブ複数化時の将来対応。
 * @param props - {@link SubNavProps}
 * @returns tablist 要素
 */
export const SubNav = ({
  tabs,
  activeTabId,
  onSelect,
  onBack,
}: SubNavProps) => {
  return (
    <nav
      className="flex min-w-0 items-center gap-3 border-b border-border bg-surface px-4 text-xs"
      aria-label="プロジェクト設定"
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex shrink-0 items-center gap-1.5 font-medium text-muted hover:text-accent"
      >
        <span aria-hidden="true">←</span>戻る
      </button>
      <span className="shrink-0 font-mono text-[11.5px] text-text-dim">
        · .spec-board /{" "}
        <strong className="text-foreground">プロジェクト設定</strong>
      </span>
      <div
        role="tablist"
        className="ml-4 flex h-full min-w-0 flex-1 gap-0.5 overflow-x-auto"
      >
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
                  ? "h-full shrink-0 border-b-2 border-accent px-3 text-xs font-medium text-foreground"
                  : "h-full shrink-0 border-b-2 border-transparent px-3 text-xs font-medium text-muted hover:text-foreground"
              }
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  title={`${tab.count}件`}
                  data-count={tab.count}
                  className="ml-1.5 rounded-full border border-border bg-background px-1.5 py-0.5 font-mono text-[10.5px] text-muted after:content-[attr(data-count)]"
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
