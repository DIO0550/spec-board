import { useEffect, useRef } from "react";
import { useLabelsInput } from "@/features/detail/hooks/useLabelsInput";

/** LabelEditor の Props */
type LabelEditorProps = {
  /** 現在のラベル一覧 */
  labels: string[];
  /**
   * ラベル追加時のコールバック
   * @param label - 追加するラベル名
   */
  onAdd: (label: string) => void;
  /**
   * ラベル削除時のコールバック
   * @param label - 削除するラベル名
   */
  onRemove: (label: string) => void;
};

/**
 * ラベルの表示・追加・削除を行うエディタコンポーネント
 * @param props - {@link LabelEditorProps}
 * @returns ラベルエディタ要素
 */
export const LabelEditor = ({ labels, onAdd, onRemove }: LabelEditorProps) => {
  const input = useLabelsInput({ existingLabels: labels, onCommit: onAdd });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (input.state.kind === "adding") {
      inputRef.current?.focus();
    }
  }, [input.state.kind]);

  return (
    <div data-testid="label-editor">
      <div className="mb-1 text-xs font-medium text-gray-500">ラベル</div>
      <div className="flex flex-wrap gap-1.5">
        {[...new Set(labels)].map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700"
          >
            {label}
            <button
              type="button"
              aria-label={`ラベル「${label}」を削除`}
              className="ml-0.5 rounded text-gray-400 hover:text-gray-700"
              onClick={() => onRemove(label)}
            >
              ×
            </button>
          </span>
        ))}
        {input.state.kind === "adding" ? (
          <input
            ref={inputRef}
            type="text"
            value={input.state.input}
            onChange={(e) => input.setInput(e.target.value)}
            onKeyDown={input.handleKeyDown}
            onBlur={input.confirmAdding}
            className="rounded border border-blue-400 px-1.5 py-0.5 text-xs outline-none"
            data-testid="label-input"
            placeholder="ラベル名"
          />
        ) : (
          <button
            type="button"
            className="rounded border border-dashed border-gray-300 px-1.5 py-0.5 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
            data-testid="label-add-button"
            onClick={input.startAdding}
          >
            + 追加
          </button>
        )}
      </div>
    </div>
  );
};
