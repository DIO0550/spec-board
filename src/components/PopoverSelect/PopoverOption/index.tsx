import { OptionBadge } from "../OptionBadge";
import { OptionSwatch } from "../OptionSwatch";
import type { PopoverSelectOption } from "../types";

type PopoverOptionProps = {
  /** 描画対象の option。 */
  option: PopoverSelectOption;
  /** button の id（`${listboxId}-option-${index}`）。aria-activedescendant の参照先。 */
  optionId: string;
  /** テスト用 ID（`${dataTestid}-option-${option.value}`）。 */
  testId: string;
  /** 現在値と一致しているか（aria-selected / font-medium）。 */
  selected: boolean;
  /** highlight 中か（activeIndex と一致：bg-panel-2）。 */
  active: boolean;
  /** マウスオーバーで activeIndex を移す。 */
  onMouseEnter: () => void;
  /** クリックで確定（selectAt）。 */
  onSelect: () => void;
};

/**
 * listbox の option 1 件（`role="option"` ボタン）。
 * badge 優先、なければ swatch + label を button 直下に描画する。
 * @param props - {@link PopoverOptionProps}
 * @returns option ボタン要素
 */
export const PopoverOption = (props: PopoverOptionProps) => {
  const { option } = props;
  return (
    <button
      type="button"
      id={props.optionId}
      role="option"
      aria-selected={props.selected}
      tabIndex={-1}
      onMouseEnter={props.onMouseEnter}
      onClick={props.onSelect}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm ${
        props.active ? "bg-panel-2" : "hover:bg-panel-2"
      } ${props.selected ? "font-medium" : ""}`}
      data-testid={props.testId}
    >
      {option.badgeClassName !== undefined ? (
        <OptionBadge
          label={option.label}
          badgeClassName={option.badgeClassName}
        />
      ) : (
        <>
          {option.swatchColor !== undefined && (
            <OptionSwatch color={option.swatchColor} />
          )}
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
        </>
      )}
    </button>
  );
};
