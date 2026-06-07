import { Due } from "@/domains/due";

/**
 * クライアントのローカル日付を `YYYY-MM-DD` で返す。
 * @returns ローカルタイムゾーンでの今日の日付
 */
const todayLocal = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type DueBadgeProps = {
  /** 期限の生文字列（未検証・未設定可） */
  due: string | undefined;
  /** 基準日（テスト注入用）。省略時はローカル日付。 */
  today?: string;
};

/**
 * 期限を today 基準で相対表示するバッジ。
 * @param props - {@link DueBadgeProps}
 * @returns 期限バッジ要素。未設定・不正時は null。overdue は赤系背景で強調。
 */
export const DueBadge = ({ due, today = todayLocal() }: DueBadgeProps) => {
  const label = Due.format(due, today);
  if (label === undefined) {
    return null;
  }

  const overdue = Due.isOverdue(due, today);
  const styles = overdue
    ? "bg-red-100 text-red-800"
    : "bg-surface-muted text-foreground";

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${styles}`}
    >
      {label}
    </span>
  );
};
