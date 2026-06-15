import { useCallback, useId, useLayoutEffect, useRef } from "react";
import {
  MarkdownInsert,
  type MarkdownInsertKind,
  type TextSelection,
} from "@/features/task-form/lib/markdownInsert";
import { MarkdownToolbar } from "../MarkdownToolbar";

type TaskFormBodyProps = {
  /** 現在値 */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string) => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * タスク本文（Markdown）入力フィールド。
 * ツールバーから記法を適用でき、適用後は選択範囲を復元する。
 * @param props - {@link TaskFormBodyProps}
 * @returns 本文入力 UI
 */
export const TaskFormBody = ({
  value,
  onChange,
  disabled,
}: TaskFormBodyProps) => {
  const id = useId();
  const bodyId = `${id}-body`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 適用後に復元する選択範囲。controlled textarea のため onChange の再レンダーで
  // value が反映された後に useLayoutEffect で 1 回だけ setSelectionRange する。
  const pendingSelectionRef = useRef<TextSelection | null>(null);

  const handleApply = useCallback(
    (kind: MarkdownInsertKind) => {
      const el = textareaRef.current;
      if (el === null) {
        return;
      }
      const result = MarkdownInsert.apply(kind, el.value, {
        start: el.selectionStart,
        end: el.selectionEnd,
      });
      pendingSelectionRef.current = result.selection;
      onChange(result.text);
      el.focus();
    },
    [onChange],
  );

  // 依存配列なしで毎レンダー後に走らせ、pending がある（= 直前の handleApply で
  // onChange した）レンダーでのみ選択範囲を復元する。ref ガードで 1 回だけ実行される。
  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    const el = textareaRef.current;
    if (pending === null || el === null) {
      return;
    }
    pendingSelectionRef.current = null;
    el.setSelectionRange(pending.start, pending.end);
  });

  return (
    <div>
      <label htmlFor={bodyId} className="sr-only">
        説明
      </label>
      <MarkdownToolbar onApply={handleApply} disabled={disabled} />
      <textarea
        ref={textareaRef}
        id={bodyId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={8}
        placeholder="説明を入力… Markdown が使えます。右側にプレビューが表示されます。"
        className="block min-h-[200px] w-full resize-y rounded-b-lg border border-border bg-panel px-3.5 py-3 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-text-dim focus:border-accent disabled:bg-surface-muted"
        data-testid="task-form-body"
      />
    </div>
  );
};
