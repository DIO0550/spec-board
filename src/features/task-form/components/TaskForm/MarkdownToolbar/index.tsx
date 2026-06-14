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

/** ツールバーの 1 エントリ（操作ボタン or 視覚的な区切り）。 */
type ToolbarEntry =
  | { type: "button"; kind: MarkdownInsertKind; label: string; display: string }
  | { type: "sep"; id: string };

/** ツールバーのエントリ定義（デザイン順固定: H B I | 引用 コード リンク | • 1. ☐）。 */
const TOOLBAR_ITEMS: ReadonlyArray<ToolbarEntry> = [
  { type: "button", kind: "heading", label: "見出し", display: "H" },
  { type: "button", kind: "bold", label: "太字", display: "B" },
  { type: "button", kind: "italic", label: "斜体", display: "I" },
  { type: "sep", id: "sep-inline" },
  { type: "button", kind: "quote", label: "引用", display: "”" },
  { type: "button", kind: "code", label: "コード", display: "<>" },
  { type: "button", kind: "link", label: "リンク", display: "🔗" },
  { type: "sep", id: "sep-list" },
  { type: "button", kind: "bulletList", label: "箇条書きリスト", display: "•" },
  {
    type: "button",
    kind: "orderedList",
    label: "番号付きリスト",
    display: "1.",
  },
  { type: "button", kind: "taskList", label: "タスクリスト", display: "☐" },
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
      className="flex items-center gap-px rounded-t-md border border-b-0 border-border bg-panel-2 p-1.5"
      data-testid="task-form-md-toolbar"
    >
      {TOOLBAR_ITEMS.map((item) =>
        item.type === "sep" ? (
          <span
            key={item.id}
            aria-hidden="true"
            className="mx-1 h-4 w-px bg-border"
          />
        ) : (
          <button
            key={item.kind}
            type="button"
            aria-label={item.label}
            title={item.label}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onApply(item.kind)}
            className="inline-flex size-7 items-center justify-center rounded font-mono text-xs font-semibold text-text-dim hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
            data-testid={`task-form-md-toolbar-${item.kind}`}
          >
            {item.display}
          </button>
        ),
      )}
    </div>
  );
};
