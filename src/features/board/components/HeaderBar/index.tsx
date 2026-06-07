import type { AppView } from "@/hooks/useAppView";

/** ヘッダーバーの Props */
type HeaderBarProps = {
  /** プロジェクト名（未指定時は「spec-board」を表示） */
  projectName?: string;
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
 * ボード上部のヘッダーバー
 * @param props - {@link HeaderBarProps}
 * @returns ヘッダーバー要素
 */
export const HeaderBar = ({
  projectName,
  view = "board",
  onSettingsClick,
  onMilestoneClick,
  onOpenClick,
}: HeaderBarProps) => {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
      <h1 className="text-lg font-semibold text-foreground">
        {projectName ?? "spec-board"}
      </h1>
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
          className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:brightness-95"
        >
          開く
        </button>
      </div>
    </header>
  );
};
