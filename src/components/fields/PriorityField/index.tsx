import { PopoverSelect } from "@/components/PopoverSelect";
import { Priority } from "@/domains/priority";

// board の PriorityBadge と同じ配色。変更時は両者を揃えること。
const PRIORITY_BADGE_CLASSES: Record<Priority, string> = {
  High: "bg-red-100 text-red-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};

/** PriorityField の Props */
export type PriorityFieldProps = {
  /** 現在値（未選択は undefined を正準とする） */
  value: Priority | undefined;
  /**
   * 選択変更時のコールバック。
   * @param value - 選択された優先度（「なし」は undefined）
   */
  onChange: (value: Priority | undefined) => void;
  /** 無効化（既定 false） */
  disabled?: boolean;
};

/**
 * 優先度選択フィールド（作成・編集共用の唯一実装）。
 * 未選択を `undefined` に正規化し、内部で PopoverSelect の `""`（「なし」）と相互変換する。
 * @param props - {@link PriorityFieldProps}
 * @returns 優先度選択 UI
 */
export const PriorityField = ({
  value,
  onChange,
  disabled = false,
}: PriorityFieldProps) => {
  return (
    <PopoverSelect
      label="優先度"
      options={[
        { value: "", label: "なし" },
        ...Priority.OPTIONS.map((p) => ({
          value: p,
          label: p,
          badgeClassName: PRIORITY_BADGE_CLASSES[p],
        })),
      ]}
      value={value ?? ""}
      onChange={(v) => onChange(Priority.parse(v))}
      disabled={disabled}
      data-testid="priority-field"
    />
  );
};
