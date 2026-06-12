import type { KeyboardEvent } from "react";
import { useId } from "react";

/** チップ 1 件分の選択肢定義。 */
export type ChipOption = {
  /** onChange に渡す値 */
  value: string;
  /** チップに表示するテキスト */
  label: string;
  /** 選択中チップの強調色（CSS color 値。カラム accent 等） */
  accentColor?: string;
  /** チップ個別の追加クラス（優先度の配色など） */
  className?: string;
};

type ChipRadioGroupProps = {
  /** グループのラベルテキスト */
  label: string;
  /** 必須マーク（*）を表示するか */
  required?: boolean;
  /** 選択肢 */
  options: readonly ChipOption[];
  /** 現在値 */
  value: string;
  /**
   * 選択変更時のコールバック。
   * @param value - 選択されたチップの値
   */
  onChange: (value: string) => void;
  /** 無効化 */
  disabled: boolean;
  /** テスト用 ID（チップ個別には `${dataTestid}-chip-${value}` を付与） */
  "data-testid": string;
};

/**
 * 前後移動キーから移動方向を返す。
 * @param key - KeyboardEvent.key
 * @returns 次へは +1、前へは -1、対象外キーは undefined
 */
const arrowDelta = (key: string): number | undefined => {
  if (key === "ArrowRight" || key === "ArrowDown") {
    return 1;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return -1;
  }
  return undefined;
};

/**
 * チップの className を選択状態に応じて組み立てる。
 * @param isChecked - そのチップが選択中か
 * @param extraClassName - option 個別の追加クラス
 * @returns ボタンに適用する className
 */
const chipClass = (isChecked: boolean, extraClassName?: string): string => {
  const base =
    "rounded-full border px-3 py-1 text-sm inline-flex items-center gap-1.5 disabled:opacity-50";
  const state = isChecked
    ? "border-accent bg-accent-soft text-foreground"
    : "border-border text-muted hover:bg-surface-muted";
  if (extraClassName === undefined) {
    return `${base} ${state}`;
  }
  return `${base} ${state} ${extraClassName}`;
};

/**
 * ステータス / 優先度で共用する単一選択チップグループ。
 * radiogroup + radio のセマンティクスと roving tabIndex・矢印キーによる
 * 前後移動（端は反対側へ循環）を提供する。
 * @param props - {@link ChipRadioGroupProps}
 * @returns チップグループ要素
 */
export const ChipRadioGroup = (props: ChipRadioGroupProps) => {
  const labelId = `${useId()}-chip-group-label`;

  // 矢印キーで前後の選択肢へ選択を移動する（radiogroup の標準操作）。
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = arrowDelta(e.key);
    if (delta === undefined) {
      return;
    }
    e.preventDefault();
    const currentIndex = props.options.findIndex(
      (option) => option.value === props.value,
    );
    if (currentIndex === -1) {
      return;
    }
    const length = props.options.length;
    const nextIndex = (currentIndex + delta + length) % length;
    props.onChange(props.options[nextIndex].value);
  };

  return (
    <div>
      <span
        id={labelId}
        className="mb-1 block text-xs font-medium text-foreground"
      >
        {props.label}
        {props.required === true && <span className="text-red-600"> *</span>}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex flex-wrap gap-1.5"
        data-testid={props["data-testid"]}
      >
        {props.options.map((option) => {
          const isChecked = option.value === props.value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: チップ型 UI のスタイル制御と roving tabIndex のため WAI-ARIA radio パターンを button で実装する
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isChecked}
              tabIndex={isChecked ? 0 : -1}
              disabled={props.disabled}
              onClick={() => props.onChange(option.value)}
              onKeyDown={handleKeyDown}
              className={chipClass(isChecked, option.className)}
              style={
                isChecked && option.accentColor !== undefined
                  ? { borderColor: option.accentColor }
                  : undefined
              }
              data-testid={`${props["data-testid"]}-chip-${option.value}`}
            >
              {isChecked && option.accentColor !== undefined && (
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: option.accentColor }}
                />
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
