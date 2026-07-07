import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PopoverOption } from "./PopoverOption";
import { SelectedDisplay } from "./SelectedDisplay";
import type { PopoverSelectOption } from "./types";

type PopoverSelectProps = {
  /** フィールドのラベルテキスト */
  label: string;
  /** 必須マーク（*）を表示するか */
  required?: boolean;
  /** 選択肢 */
  options: readonly PopoverSelectOption[];
  /** 現在値 */
  value: string;
  /**
   * 選択変更時のコールバック。
   * @param value - 選択された option の値
   */
  onChange: (value: string) => void;
  /** 無効化 */
  disabled: boolean;
  /**
   * テスト用 ID。trigger に付与し、option は `${dataTestid}-option-${value}`、
   * listbox は `${dataTestid}-listbox` を付与する。
   */
  "data-testid": string;
};

/** ハイライトなしを表す activeIndex 値。 */
const NO_ACTIVE = -1;

/**
 * status / priority 共用の popover select。
 * trigger（`aria-haspopup="listbox"` ボタン）と `role="listbox"` の popover からなる
 * 単一選択 UI。値セマンティクス（onChange / 初期値反映）は旧 ChipRadioGroup と同一に保つ。
 *
 * - 開閉: trigger クリック / ArrowDown / Enter で開き、option 選択・Esc・外側クリックで閉じる。
 * - キーボード: ArrowUp/Down/Home/End で highlight を移動（端は循環）、Enter で確定。
 * - Esc: 開いている間だけ capture フェーズで捕捉 + stopPropagation し、親画面の Esc
 *   （破棄確認）へ伝播させない。閉じている間はリスナーを張らず親の Esc を妨げない。
 * @param props - {@link PopoverSelectProps}
 * @returns popover select 要素
 */
export const PopoverSelect = (props: PopoverSelectProps) => {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const listboxId = `${baseId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE);

  const selectedOption = props.options.find((o) => o.value === props.value);

  // setState セッターのみを使う安定参照。effect の依存に入れても再購読を誘発しない。
  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(NO_ACTIVE);
  }, []);

  const open = () => {
    const selectedIndex = props.options.findIndex(
      (o) => o.value === props.value,
    );
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    setIsOpen(true);
  };

  const selectAt = (index: number) => {
    const option = props.options[index];
    if (option === undefined) {
      return;
    }
    props.onChange(option.value);
    close();
  };

  // 開いている間だけ listbox へフォーカスを移し、キーボード操作を受け取れるようにする。
  useEffect(() => {
    if (isOpen) {
      listboxRef.current?.focus();
    }
  }, [isOpen]);

  // active option をビューポート内へスクロールする（選択肢が多いとき highlight が
  // 見えない位置に移動しないように）。block:"nearest" で最小限のスクロールに留める。
  useEffect(() => {
    if (!isOpen || activeIndex === NO_ACTIVE) {
      return;
    }
    const active = document.getElementById(
      `${listboxId}-option-${activeIndex}`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex, listboxId]);

  // 開いている間だけ capture フェーズで Escape を捕捉し、親画面の Esc 破棄確認へ
  // 伝播させない（閉じている間はリスナーを張らないため親の Esc は通常どおり動く）。
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, close]);

  // 開いている間の外側 mousedown で閉じる。
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current === null) {
        return;
      }
      if (e.target instanceof Node && containerRef.current.contains(e.target)) {
        return;
      }
      close();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, close]);

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (props.disabled) {
      return;
    }
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      open();
    }
  };

  const handleListboxKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const length = props.options.length;
    if (length === 0) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 + length) % length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + length) % length);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectAt(activeIndex);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <span
        id={labelId}
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {props.label}
        {props.required === true && <span className="text-red-600">*</span>}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        // ラベル文言 + 現在の選択値の両方をアクセシブルネームに含める
        // （選択値が SR に読み上げられるようにする）。
        aria-labelledby={`${labelId} ${valueId}`}
        disabled={props.disabled}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
        className={`flex min-h-10 w-full max-w-[340px] items-center gap-2 rounded-md border bg-panel px-3 py-2 text-left text-sm text-foreground hover:border-border-strong disabled:opacity-50 ${
          isOpen ? "border-accent" : "border-border"
        }`}
        data-testid={props["data-testid"]}
      >
        <span id={valueId} className="inline-flex min-w-0 items-center">
          <SelectedDisplay option={selectedOption} />
        </span>
        <span aria-hidden="true" className="ml-auto shrink-0 text-text-dim">
          ▾
        </span>
      </button>
      {isOpen && (
        <div
          ref={listboxRef}
          tabIndex={-1}
          role="listbox"
          aria-labelledby={labelId}
          aria-activedescendant={
            activeIndex === NO_ACTIVE
              ? undefined
              : `${listboxId}-option-${activeIndex}`
          }
          onKeyDown={handleListboxKeyDown}
          className="absolute left-0 right-0 z-10 mt-1 max-h-72 max-w-[340px] overflow-y-auto rounded-lg border border-border-strong bg-panel p-1.5 shadow-lg outline-none"
          data-testid={`${props["data-testid"]}-listbox`}
        >
          {props.options.map((option, index) => (
            <PopoverOption
              key={option.value}
              option={option}
              optionId={`${listboxId}-option-${index}`}
              testId={`${props["data-testid"]}-option-${option.value}`}
              selected={option.value === props.value}
              active={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onSelect={() => selectAt(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
