import type { AppView } from "@/hooks/useAppView";

/** ヘッダーバーの Props */
type HeaderBarProps = {
  /** 現在の画面区分。settings 中のみ「ボードへ戻る」表記に切替（board / detail は「設定」、既定 board） */
  view?: AppView;
  /** 設定ボタンのクリックハンドラ */
  onSettingsClick: () => void;
  /**
   * マイルストーンビュー切替ボタンのクリックハンドラ。
   * 未指定（プロジェクト未オープン等）のときはボタンを表示しない。
   */
  onMilestoneClick?: () => void;
  /** 「開く」ボタンのクリックハンドラ */
  onOpenClick: () => void;
};

/**
 * ボード上部のヘッダーバー。
 * プロジェクト名見出しとテーマトグルはサイドバー（ProjectSwitcher / ThemeToggleButton）へ
 * 集約したため、ここではビュー固有アクション（マイルストーン切替 / 設定 / 開く）のみを右寄せで表示する。
 * @param props - {@link HeaderBarProps}
 * @returns ヘッダーバー要素
 */
export const HeaderBar = ({
  view = "board",
  onSettingsClick,
  onMilestoneClick,
  onOpenClick,
}: HeaderBarProps) => {
  return (
    <header className="flex items-center justify-end border-b border-border bg-surface px-4 py-2">
      <div className="flex items-center gap-2">
        {onMilestoneClick && (
          <button
            type="button"
            onClick={onMilestoneClick}
            className="rounded px-3 py-1.5 text-sm text-muted hover:bg-surface-muted"
          >
            {view === "milestone" ? "ボードへ戻る" : "マイルストーン"}
          </button>
        )}
        <button
          type="button"
          onClick={onSettingsClick}
          className="rounded px-3 py-1.5 text-sm text-muted hover:bg-surface-muted"
        >
          {view === "settings" ? "ボードへ戻る" : "設定"}
        </button>
        <button
          type="button"
          onClick={onOpenClick}
          className="rounded bg-accent px-3 py-1.5 text-sm text-accent-foreground hover:brightness-95"
        >
          開く
        </button>
      </div>
    </header>
  );
};
