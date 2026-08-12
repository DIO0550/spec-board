import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { usePopoverDismiss } from "@/hooks/usePopoverDismiss";
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
  const listboxRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(NO_ACTIVE);
  // 開閉 + Esc capture 非伝播 + 外側 mousedown は共通フックに委譲する。
  // listbox のキーボード循環（activeIndex）は本コンポーネントに残す。
  const {
    isOpen,
    open: openPopover,
    close,
    containerRef,
  } = usePopoverDismiss();

  const selectedOption = props.options.find((o) => o.value === props.value);

  /** 選択値（無ければ先頭）を highlight した状態で popover を開く。 */
  const open = () => {
    const selectedIndex = props.options.findIndex(
      (o) => o.value === props.value,
    );
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    openPopover();
  };

  /**
   * 指定 index の option を確定して閉じる。
   * @param index - 確定する option の index
   */
  const selectAt = (index: number) => {
    const option = props.options[index];
    if (option === undefined) {
      return;
    }
    props.onChange(option.value);
    close();
  };

  // close（Esc / 外側クリック / 選択確定）に伴い highlight を消す。dismiss はフックが
  // 担うため、ここでは isOpen の変化に追従して activeIndex を揃えるだけにする。
  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(NO_ACTIVE);
    }
  }, [isOpen]);

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

  /**
   * trigger のキーボード操作。ArrowDown / Enter で開く。
   * @param e - keydown イベント
   */
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
            activeIndex === NO_ACTIVE || activeIndex >= props.options.length
              ? undefined
              : `${listboxId}-option-${activeIndex}`
          }
          onKeyDown={handleListboxKeyDown}
          className="absolute left-0 z-10 mt-1 w-[232px] max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-panel p-1.5 shadow-lg outline-none"
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
