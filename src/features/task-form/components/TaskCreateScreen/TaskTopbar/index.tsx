type TaskTopbarProps = {
  /** プロジェクト名（crumbs に monospace で表示）。 */
  projectName?: string;
  /** プロジェクト絶対パス（crumbs に dim 表示）。 */
  projectPath?: string;
  /**
   * 同期バッジに出す監視ファイル数。読み込み済みタスク総数を流用する（BE 配線なし）。
   */
  watchedFileCount: number;
  /** プレビュー表示中か（pvToggle の aria-pressed）。 */
  previewVisible: boolean;
  /** プレビュー表示トグル。 */
  onTogglePreview: () => void;
};

/**
 * 作成画面上部 chrome（topbar 48px）。
 * brand + crumbs（projectName / projectPath）+ 同期ステータスバッジ + 検索/プレビュートグル。
 * 同期バッジの件数は FE 既存値（読み込み済みタスク総数）を流用し「監視 N files」と表示する。
 * @param props - {@link TaskTopbarProps}
 * @returns topbar 要素
 */
export const TaskTopbar = (props: TaskTopbarProps) => {
  return (
    <div className="flex h-12 items-center gap-4 border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <span className="size-[22px] shrink-0 rounded-md bg-gradient-to-br from-create-accent to-create-accent-border" />
        <span className="sr-only">spec-board</span>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-xs text-muted">
        <span className="text-text-dim">/</span>
        {props.projectName !== undefined && (
          <span className="font-medium text-foreground">
            {props.projectName}
          </span>
        )}
        {props.projectPath !== undefined && (
          <>
            <span className="text-text-dim">·</span>
            <span className="text-text-dim">{props.projectPath}</span>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel-2 px-2 py-1 text-[11.5px] text-muted"
          data-testid="task-topbar-sync"
        >
          <span className="size-1.5 rounded-full bg-create-accent" />
          同期中 · 監視 {props.watchedFileCount} files
        </span>
        <button
          type="button"
          aria-label="検索"
          disabled
          className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-panel-2 text-muted disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.75]"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m16.5 16.5 4 4" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="プレビューを開閉"
          title="プレビューを開閉"
          aria-pressed={props.previewVisible}
          onClick={props.onTogglePreview}
          className="spec-header-hidden-control inline-flex size-7 items-center justify-center rounded-md border border-border bg-panel-2 text-muted hover:border-border-strong aria-pressed:border-create-accent-border aria-pressed:bg-create-accent-soft aria-pressed:text-create-accent"
          data-testid="task-topbar-preview-toggle"
        >
          ▦
        </button>
      </div>
    </div>
  );
};
