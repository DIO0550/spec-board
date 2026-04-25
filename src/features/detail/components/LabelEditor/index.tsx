import type { KeyboardEvent } from "react";
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
  // Enter / Escape 経由で閉じた直後に発火する blur が
  // stale closure を介して onCommit を再実行するのを防ぐためのフラグ。
  // useLabelsInput 内では使わない（hook 規約: ref フラグ不可）。
  const justClosedByKeyRef = useRef(false);

  useEffect(() => {
    if (input.state.kind === "adding") {
      inputRef.current?.focus();
    }
  }, [input.state.kind]);

  /**
   * input の keydown ラッパー。Enter / Escape の場合は justClosedByKeyRef を
   * 立ててから hook のハンドラを呼ぶ。後続の blur はこのフラグで抑止する。
   * @param e - keydown イベント
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    justClosedByKeyRef.current = e.key === "Enter" || e.key === "Escape";
    input.handleKeyDown(e);
  };

  /**
   * input の blur ラッパー。Enter / Escape 由来の blur は無視し、
   * それ以外（フォーカス外しなど）の場合のみ confirmAdding を呼ぶ。
   */
  const handleBlur = () => {
    const justClosedByKey = justClosedByKeyRef.current;
    justClosedByKeyRef.current = false;
    if (justClosedByKey) return;
    input.confirmAdding();
  };

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
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
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
