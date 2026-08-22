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
  /** ラベル設定画面を開くハンドラ。 */
  onLabelsClick?: () => void;
  /** ディレクトリ選択ハンドラ。 */
  onOpenClick: () => void;
};

/** @returns サイドバー開閉ボタンのアイコン */
const SidebarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

/** @returns タスク作成ボタンのプラスアイコン */
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** @returns 検索ボタンの虫眼鏡アイコン */
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4 4" />
  </svg>
);

/** @returns 設定ボタンの歯車アイコン */
const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a2 2 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09A1.65 1.65 0 0 0 19.4 15z" />
  </svg>
);

/** @returns ラベル設定ボタンのタグアイコン */
const LabelIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <path d="m20.6 13.4-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7" cy="7" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

/** @returns プロジェクトを開くボタンのフォルダアイコン */
const FolderIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5">
    <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
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
  onLabelsClick,
  onOpenClick,
}: HeaderBarProps) => {
  const settingsLabel = view === "settings" ? "ボードへ戻る" : "設定";
  const milestoneLabel =
    view === "milestone" ? "ボードへ戻る" : "マイルストーン";
  const showBoardActions = view === "board";
  const showDetailActions = view === "detail";
  const showSettingsChrome = view === "settings" || view === "milestone";

  return (
    <header
      data-header-view={view}
      className="spec-header flex h-12 shrink-0 items-center gap-4 overflow-hidden border-b border-border bg-surface px-4"
    >
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
            <span
              className={
                showSettingsChrome ? "spec-header-brand-name-hidden" : undefined
              }
            >
              spec-board
            </span>
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
        <span data-header-theme className="spec-header-hidden-control">
          <ThemeToggleButton />
        </span>
        {onSearchClick && (
          <button
            type="button"
            aria-label="グローバル検索を開く"
            onClick={onSearchClick}
            className="spec-icon-button"
          >
            <SearchIcon />
            <span className="sr-only">検索</span>
          </button>
        )}
        {onGuideClick && (
          <button
            type="button"
            onClick={onGuideClick}
            className="spec-button spec-header-hidden-control"
          >
            GUIDE.md
          </button>
        )}
        {onMilestoneClick && (
          <button
            type="button"
            onClick={onMilestoneClick}
            className="spec-button spec-header-hidden-control"
          >
            {milestoneLabel}
          </button>
        )}
        {onLabelsClick && (showBoardActions || showDetailActions) && (
          <button
            type="button"
            aria-label="ラベル管理"
            onClick={onLabelsClick}
            className="spec-icon-button"
          >
            <LabelIcon />
            <span className="sr-only">ラベル管理</span>
          </button>
        )}
        <button
          type="button"
          aria-label={settingsLabel}
          onClick={onSettingsClick}
          className={
            showBoardActions
              ? "spec-icon-button"
              : "spec-button spec-header-hidden-control"
          }
        >
          <SettingsIcon />
          <span className="sr-only">{settingsLabel}</span>
        </button>
        <button
          type="button"
          onClick={onOpenClick}
          className={
            showBoardActions
              ? "spec-button"
              : "spec-button spec-header-hidden-control"
          }
        >
          <FolderIcon />
          <span>開く</span>
        </button>
        {onNewTaskClick && (
          <button
            type="button"
            onClick={onNewTaskClick}
            className={
              showBoardActions || showDetailActions
                ? "spec-button spec-button-primary"
                : "spec-button spec-button-primary spec-header-hidden-control"
            }
          >
            <PlusIcon />
            新規タスク
          </button>
        )}
      </div>
    </header>
  );
};
