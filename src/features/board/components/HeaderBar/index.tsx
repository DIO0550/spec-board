import { ThemeToggleButton } from "@/features/shell";
import type { AppView } from "@/providers/AppViewProvider";

type HeaderBarProps = {
  /** 現在の画面区分。 */
  view?: AppView;
  /** 現在のプロジェクト名。未選択時は brand chrome を簡略表示する。 */
  projectName?: string;
  /** 現在のプロジェクトパス。 */
  projectPath?: string;
  /** 監視中のファイル数。 */
  watchedFileCount?: number;
  /** sidebar が折りたたまれているか。 */
  sidebarCollapsed?: boolean;
  /** sidebar 開閉ハンドラ。 */
  onSidebarToggle?: () => void;
  /** 設定ボタンのクリックハンドラ。 */
  onSettingsClick: () => void;
  /** マイルストーンビュー切替ハンドラ。 */
  onMilestoneClick?: () => void;
  /** 新規タスク作成ハンドラ。 */
  onNewTaskClick?: () => void;
  /** GUIDE.mdを開くハンドラ。未指定時は導線を表示しない。 */
  onGuideClick?: () => void;
  /** Global Search / Command Paletteを開く。 */
  onSearchClick?: () => void;
  /** ディレクトリ選択ハンドラ。 */
  onOpenClick: () => void;
};

const SidebarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * アプリ共通の48px topbar。project breadcrumb、同期状態、主要操作を表示する。
 * @param props - {@link HeaderBarProps}
 * @returns topbar要素
 */
export const HeaderBar = ({
  view = "board",
  projectName,
  projectPath,
  watchedFileCount = 0,
  sidebarCollapsed = false,
  onSidebarToggle,
  onSettingsClick,
  onMilestoneClick,
  onNewTaskClick,
  onGuideClick,
  onSearchClick,
  onOpenClick,
}: HeaderBarProps) => {
  const settingsLabel = view === "settings" ? "ボードへ戻る" : "設定";
  const milestoneLabel =
    view === "milestone" ? "ボードへ戻る" : "マイルストーン";

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 overflow-hidden border-b border-border bg-surface px-4">
      {sidebarCollapsed && onSidebarToggle && (
        <button
          type="button"
          onClick={onSidebarToggle}
          aria-label="サイドバーを開く"
          aria-expanded={false}
          className="spec-icon-button"
        >
          <SidebarIcon />
        </button>
      )}

      {projectName && (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]">
            <span className="spec-brand-mark" aria-hidden="true" />
            <span>spec-board</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted">
            <span aria-hidden="true" className="text-text-dim">
              /
            </span>
            <span className="font-medium text-foreground">{projectName}</span>
            {projectPath && (
              <>
                <span aria-hidden="true" className="text-text-dim">
                  ·
                </span>
                <span className="truncate text-text-dim" title={projectPath}>
                  {projectPath}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {projectName && (
          <span className="spec-sync-pill">
            <span className="spec-sync-pulse" aria-hidden="true" />
            同期中 · 監視 {watchedFileCount} files
          </span>
        )}
        <ThemeToggleButton />
        {onSearchClick && (
          <button
            type="button"
            aria-label="グローバル検索を開く"
            onClick={onSearchClick}
            className="spec-button"
          >
            検索 <kbd className="font-mono text-[10px]">⌘K</kbd>
          </button>
        )}
        {onGuideClick && (
          <button type="button" onClick={onGuideClick} className="spec-button">
            GUIDE.md
          </button>
        )}
        {onMilestoneClick && (
          <button
            type="button"
            onClick={onMilestoneClick}
            className="spec-button"
          >
            {milestoneLabel}
          </button>
        )}
        <button type="button" onClick={onSettingsClick} className="spec-button">
          {settingsLabel}
        </button>
        <button type="button" onClick={onOpenClick} className="spec-button">
          開く
        </button>
        {onNewTaskClick && (
          <button
            type="button"
            onClick={onNewTaskClick}
            className="spec-button spec-button-primary"
          >
            <PlusIcon />
            新規タスク
          </button>
        )}
      </div>
    </header>
  );
};
