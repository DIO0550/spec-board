type TaskSubbarProps = {
  /** 保存先ファイル名（`.md` 込みの派生表示文字列）。 */
  fileName: string;
  /** 一覧へ戻る（dirty 時は呼び出し側で破棄確認を経由する）。 */
  onBack: () => void;
};

/**
 * 作成画面の戻りバー（subbar 44px）。
 * 「← 一覧へ戻る · {fileName}」と右側のキーボードヒントチップを表示する。
 * 戻る導線は DetailScreen の「← 戻る」ボタンの配色 / focus-visible リングを踏襲する。
 * @param props - {@link TaskSubbarProps}
 * @returns subbar 要素
 */
export const TaskSubbar = (props: TaskSubbarProps) => {
  return (
    <div className="flex h-11 items-center gap-3 border-b border-border bg-panel px-4 text-xs">
      <button
        type="button"
        onClick={props.onBack}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 font-medium text-muted hover:bg-surface-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        data-testid="task-subbar-back"
      >
        ← 一覧へ戻る
      </button>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-dim">
        <span>·</span>
        <span
          className="font-medium text-foreground"
          data-testid="task-subbar-filename"
        >
          {props.fileName}
        </span>
      </span>
      <span className="ml-auto text-[11.5px] text-text-dim">
        <span className="rounded border border-border bg-bg px-1.5 py-px font-mono text-[10.5px] text-muted">
          ⌘ / Ctrl
        </span>{" "}
        +{" "}
        <span className="rounded border border-border bg-bg px-1.5 py-px font-mono text-[10.5px] text-muted">
          Enter
        </span>{" "}
        で作成 ·{" "}
        <span className="rounded border border-border bg-bg px-1.5 py-px font-mono text-[10.5px] text-muted">
          Esc
        </span>{" "}
        でキャンセル
      </span>
    </div>
  );
};
