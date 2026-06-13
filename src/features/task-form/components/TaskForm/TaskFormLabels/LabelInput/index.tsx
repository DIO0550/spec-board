import type { KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

type LabelInputProps = {
  /** input の id（TaskFormLabels の `<label htmlFor>` と合わせる） */
  id: string;
  /** 入力欄の現在値（未コミット文字列） */
  value: string;
  /**
   * 入力変更時のコールバック。
   * @param value - 新しい入力値
   */
  onChange: (value: string) => void;
  /**
   * onKeyDown ハンドラ（Enter で commit 等）。
   * @param e - キーボードイベント
   */
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** blur 時のコミットコールバック */
  onBlur: () => void;
  /** 無効化 */
  disabled?: boolean;
  /** サジェスト候補（絞り込み済み。空配列ならリストを表示しない） */
  candidates?: readonly string[];
  /**
   * サジェスト候補の確定時コールバック。
   * @param label - 確定したラベル名
   */
  onSelect?: (label: string) => void;
};

/** ハイライトなしを表す activeIndex 値。 */
const NO_HIGHLIGHT = -1;

/**
 * ラベル入力欄（コンボボックス）。
 * candidates があるとき focus / 入力でサジェストリストを表示し、
 * ArrowDown/Up でハイライト移動・Enter / クリックで確定する。
 * 確定は onSelect で親へ委譲し、開閉・ハイライトだけを UI ローカル状態で持つ。
 * @param props - {@link LabelInputProps}
 * @returns コンボボックス要素
 */
export const LabelInput = ({
  id,
  value,
  onChange,
  onKeyDown,
  onBlur,
  disabled = false,
  candidates = [],
  onSelect,
}: LabelInputProps) => {
  const listboxId = `${useId()}-label-suggest`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_HIGHLIGHT);
  const showList = isOpen && candidates.length > 0;

  // 外側 mousedown でリストを閉じる（候補ボタン側は preventDefault + 確定で先行処理）。
  useEffect(() => {
    if (!showList) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current === null) {
        return;
      }
      if (e.target instanceof Node && containerRef.current.contains(e.target)) {
        return;
      }
      setIsOpen(false);
      setActiveIndex(NO_HIGHLIGHT);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showList]);

  const close = () => {
    setIsOpen(false);
    setActiveIndex(NO_HIGHLIGHT);
  };

  const commitCandidate = (name: string) => {
    onSelect?.(name);
    close();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME 変換中のキーはリスト操作と区別し、既存ハンドラ（Enter の
    // preventDefault + commit スキップ）へそのまま委譲する。
    if (e.nativeEvent.isComposing) {
      onKeyDown(e);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!showList) {
        setIsOpen(true);
        return;
      }
      setActiveIndex((prev) => Math.min(prev + 1, candidates.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!showList) {
        return;
      }
      setActiveIndex((prev) => Math.max(prev - 1, NO_HIGHLIGHT));
      return;
    }
    if (e.key === "Escape") {
      // リスト表示中の Esc はリストを閉じるだけで、画面の Esc（キャンセル）へ
      // 伝播させない。非表示時は遮断せず画面側の処理に委ねる。
      if (showList) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      return;
    }
    if (
      e.key === "Enter" &&
      showList &&
      activeIndex !== NO_HIGHLIGHT &&
      activeIndex < candidates.length
    ) {
      e.preventDefault();
      commitCandidate(candidates[activeIndex]);
      return;
    }
    onKeyDown(e);
  };

  return (
    <div ref={containerRef} className="relative min-w-[100px] flex-1">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        // ハイライト中の候補を SR に伝える。未ハイライト時は属性自体を出さない。
        aria-activedescendant={
          showList && activeIndex !== NO_HIGHLIGHT
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActiveIndex(NO_HIGHLIGHT);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        placeholder="Enter で追加"
        className="w-full rounded border border-border px-2 py-1 text-sm outline-none focus:border-accent disabled:bg-surface-muted"
        data-testid="task-form-label-input"
      />
      {showList && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded border border-border bg-surface shadow-lg"
          data-testid="task-form-label-suggest"
        >
          {candidates.map((name, index) => (
            <button
              key={name}
              type="button"
              role="option"
              // combobox+listbox では候補を Tab 順から外し、実フォーカスは input に
              // 残したままハイライトを aria-activedescendant（input 側）で表現する。
              id={`${listboxId}-option-${index}`}
              tabIndex={-1}
              aria-selected={index === activeIndex}
              className={`block w-full truncate px-2 py-1 text-left text-sm text-foreground ${
                index === activeIndex
                  ? "bg-surface-muted"
                  : "hover:bg-surface-muted"
              }`}
              onMouseDown={(e) => {
                // blur（commit）とレースしないようフォーカスを input に維持したまま確定する。
                e.preventDefault();
                commitCandidate(name);
              }}
              data-testid={`task-form-label-suggest-option-${name}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
