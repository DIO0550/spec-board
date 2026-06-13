import type { MarkdownInsertKind } from "@/features/task-form/lib/markdownInsert";

type MarkdownToolbarProps = {
  /**
   * ボタン押下時のコールバック。
   * @param kind - 適用する記法種別
   */
  onApply: (kind: MarkdownInsertKind) => void;
  /** 無効化 */
  disabled: boolean;
};

/** ツールバーのボタン定義（表示順固定）。 */
const TOOLBAR_ITEMS: ReadonlyArray<{
  kind: MarkdownInsertKind;
  label: string;
  display: string;
}> = [
  { kind: "heading", label: "見出し", display: "H" },
  { kind: "bold", label: "太字", display: "B" },
  { kind: "italic", label: "斜体", display: "I" },
  { kind: "bulletList", label: "箇条書きリスト", display: "•" },
  { kind: "taskList", label: "タスクリスト", display: "☑" },
];

/**
 * 本文 textarea 用の Markdown 記法ツールバー。
 * mousedown を preventDefault して textarea のフォーカス・選択範囲を奪わない。
 * @param props - {@link MarkdownToolbarProps}
 * @returns ツールバー要素
 */
export const MarkdownToolbar = ({
  onApply,
  disabled,
}: MarkdownToolbarProps) => {
  return (
    <div
      role="toolbar"
      aria-label="Markdown 編集"
      className="mb-1 flex gap-1"
      data-testid="task-form-md-toolbar"
    >
      {TOOLBAR_ITEMS.map((item) => (
        <button
          key={item.kind}
          type="button"
          aria-label={item.label}
          title={item.label}
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApply(item.kind)}
          className="min-w-7 rounded border border-border px-1.5 py-0.5 text-sm text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
          data-testid={`task-form-md-toolbar-${item.kind}`}
        >
          {item.display}
        </button>
      ))}
    </div>
  );
};
