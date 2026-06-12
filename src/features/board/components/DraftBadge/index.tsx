type DraftBadgeProps = {
  /** 下書きフラグ */
  draft: boolean;
};

/**
 * 下書きタスクを示す「下書き」バッジ。
 * @param props - {@link DraftBadgeProps}
 * @returns バッジ要素。非 draft 時は null（PriorityBadge / DueBadge と同じ「未設定時 null」規約）
 */
export const DraftBadge = ({ draft }: DraftBadgeProps) => {
  if (!draft) {
    return null;
  }

  return (
    <span
      data-testid="draft-badge"
      className="inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-600"
    >
      下書き
    </span>
  );
};
