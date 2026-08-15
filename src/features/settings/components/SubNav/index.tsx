import type { SettingsTab } from "../../types";

type SubNavIconProps = {
  tabId: string;
};

const SubNavIcon = ({ tabId }: SubNavIconProps) => {
  if (tabId === "labels") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (tabId === "milestones") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path d="M4 4v16M4 4h12l-2 4 2 4H4" />
      </svg>
    );
  }
  if (tabId === "statuses") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="16" rx="1" />
        <rect x="17" y="4" width="4" height="16" rx="1" />
      </svg>
    );
  }
  if (tabId === "config") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    );
  }
  if (tabId === "appearance") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
};

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
  /** 現在のproject context。 */
  projectName?: string;
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
  projectName,
}: SubNavProps) => {
  return (
    <nav
      className="flex min-w-0 items-center gap-3 border-b border-border bg-surface px-4 text-xs"
      aria-label="プロジェクト設定"
    >
      {onBack !== undefined && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-1.5 font-medium text-muted hover:text-accent"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-3.5 fill-none stroke-current stroke-[1.75]"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          戻る
        </button>
      )}
      <span className="shrink-0 font-mono text-[11.5px] text-text-dim">
        · {projectName === undefined ? ".spec-board" : projectName} /{" "}
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
              aria-label={
                tab.count === undefined
                  ? undefined
                  : `${tab.label} ${tab.count}件`
              }
              data-settings-tab={tab.id}
              onClick={() => onSelect(tab.id)}
              className={
                isActive
                  ? "inline-flex h-full shrink-0 items-center gap-1.5 border-b-2 border-accent px-3 text-xs font-medium text-foreground"
                  : "inline-flex h-full shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-xs font-medium text-muted hover:text-foreground"
              }
            >
              <span
                aria-hidden="true"
                className="spec-stroke-icon text-text-dim"
              >
                <SubNavIcon tabId={tab.id} />
              </span>
              {tab.label}
              {tab.count !== undefined && (
                <span aria-hidden="true" className="sr-only">
                  {" "}
                </span>
              )}
              {tab.count !== undefined && (
                <span
                  title={`${tab.count}件`}
                  className="rounded-full border border-border bg-background px-1.5 py-px font-mono text-[10.5px] text-muted"
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
