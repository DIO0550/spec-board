import { LabelRegistry } from "@/domains/label-registry";

type LabelTagProps = {
  /** ラベル名 */
  label: string;
};

/**
 * @param props - {@link LabelTagProps}
 * @returns グループ色を適用したラベルタグ要素
 */
export const LabelTag = ({ label }: LabelTagProps) => {
  const { fg, bg, bd } = LabelRegistry.tokensForLabel(label);
  return (
    <span
      data-testid="label-tag"
      className="inline-flex items-center rounded-full border px-[7px] py-px text-[10.5px] font-medium leading-[1.5]"
      style={{ color: fg, backgroundColor: bg, borderColor: bd }}
    >
      {label}
    </span>
  );
};
