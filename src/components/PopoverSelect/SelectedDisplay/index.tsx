import { OptionBadge } from "../OptionBadge";
import { OptionSwatch } from "../OptionSwatch";
import type { PopoverSelectOption } from "../types";

type SelectedDisplayProps = {
  /** 選択中 option（未選択時は undefined）。 */
  option: PopoverSelectOption | undefined;
};

/**
 * 選択中 option を trigger 内に描画する（badge 優先、なければ swatch + label）。
 * 未選択（undefined）時は何も表示しない。
 * @param props - {@link SelectedDisplayProps}
 * @returns trigger 内の表示要素、未選択時は null
 */
export const SelectedDisplay = ({ option }: SelectedDisplayProps) => {
  if (option === undefined) {
    return null;
  }
  if (option.badgeClassName !== undefined) {
    return (
      <OptionBadge
        label={option.label}
        badgeClassName={option.badgeClassName}
      />
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {option.swatchColor !== undefined && (
        <OptionSwatch color={option.swatchColor} />
      )}
      <span className="truncate">{option.label}</span>
    </span>
  );
};
