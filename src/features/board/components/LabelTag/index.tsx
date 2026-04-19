type LabelTagProps = {
  /** ラベル名 */
  label: string;
};

/**
 * @param props - {@link LabelTagProps}
 * @returns ラベルタグ要素
 */
export const LabelTag = ({ label }: LabelTagProps) => {
  return (
    <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
      {label}
    </span>
  );
};
