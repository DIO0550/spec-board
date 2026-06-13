import { useCallback } from "react";
import { renderBlock } from "@/components/MarkdownContent/renderBlock";
import { Markdown } from "@/domains/markdown";
import {
  MarkdownBodyEditMode,
  useMarkdownBodyEdit,
} from "@/features/detail/hooks/useMarkdownBodyEdit";

type MarkdownBodyProps = {
  body: string;
  /**
   * 編集確定時のコールバック。未指定なら display 専用（編集起動不可）。
   * @param body - 確定された本文（未 trim の生値、空文字も可）
   */
  onConfirm?: (body: string) => void;
};

const TEXTAREA_CLASS_NAME =
  "w-full min-h-[12rem] resize-none overflow-y-auto rounded border border-accent px-2 py-1 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";

const DISPLAY_EDITABLE_WRAPPER_CLASS_NAME =
  "min-h-[3rem] cursor-text rounded px-1 py-0.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const DISPLAY_READONLY_WRAPPER_CLASS_NAME = "space-y-4";

const PLACEHOLDER_CLASS_NAME = "text-sm text-muted";

/**
 * Markdown 本文を表示・編集するコンポーネント。
 *
 * - `onConfirm` 未指定なら従来通り display 専用（空 body のとき null）。
 * - `onConfirm` 指定なら display↔edit 切替対応。空 body は placeholder 表示。
 * - 状態管理・キーバインド・focus 制御は `useMarkdownBodyEdit` に委譲する。
 *
 * @param props - {@link MarkdownBodyProps}
 * @returns Markdown 描画 / 編集用 textarea / null のいずれか
 */
export const MarkdownBody = ({ body, onConfirm }: MarkdownBodyProps) => {
  const edit = useMarkdownBodyEdit({ body, onConfirm });

  // textarea mount 時に focus + 末尾カーソル設定を行う callback ref。DOM 操作は
  // コンポーネント側の責務とし、hook の公開 API には DOM 参照を含めない。
  const focusTextareaAtEnd = useCallback((el: HTMLTextAreaElement | null) => {
    if (el === null) {
      return;
    }
    el.focus();
    const end = el.value.length;
    el.selectionStart = end;
    el.selectionEnd = end;
  }, []);

  const handleToggle = (sourceLine: number) => {
    if (onConfirm === undefined) {
      return;
    }
    onConfirm(Markdown.toggleTaskAt(body, sourceLine));
  };

  // checkbox を操作可能にするのは編集確定経路（onConfirm）が存在する場合のみ。
  // edit モード中は textarea を描画するため renderBlock 自体が呼ばれない。
  const renderOptions = {
    interactive: onConfirm !== undefined,
    onToggle: handleToggle,
  };

  if (edit.mode === MarkdownBodyEditMode.Edit) {
    return (
      <textarea
        ref={focusTextareaAtEnd}
        className={TEXTAREA_CLASS_NAME}
        value={edit.editValue}
        onChange={(e) => edit.setEditValue(e.target.value)}
        onKeyDown={edit.submitOrCancelOnKey}
        data-testid="markdown-body-textarea"
        aria-label="本文を編集"
      />
    );
  }

  const blocks = Markdown.parse(body);

  if (!edit.isEditable) {
    if (blocks.length === 0) {
      return null;
    }
    return (
      <div
        className={DISPLAY_READONLY_WRAPPER_CLASS_NAME}
        data-testid="markdown-body"
      >
        {blocks.map((block, i) => renderBlock(block, i, renderOptions))}
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Markdown ブロック要素（h1 / ul / pre 等）を内包するため <button> は HTML 仕様上使えない。role="button" + tabIndex + onKeyDown で a11y を担保する。
    <div
      role="button"
      tabIndex={0}
      className={DISPLAY_EDITABLE_WRAPPER_CLASS_NAME}
      onClick={edit.enterEditOnClick}
      onKeyDown={edit.enterEditOnKey}
      data-testid="markdown-body"
      aria-label="本文を編集する"
    >
      {blocks.length === 0 ? (
        <span className={PLACEHOLDER_CLASS_NAME}>本文を追加…</span>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, i) => renderBlock(block, i, renderOptions))}
        </div>
      )}
    </div>
  );
};
