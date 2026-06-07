import type { Task } from "@/types/task";

/** ParentLink の Props */
export type ParentLinkProps = {
  /** 遷移先となる親タスク */
  parentTask: Task;
  /**
   * 親タスク選択時のコールバック。
   * @param taskId - 遷移先となる親タスクの id
   */
  onSelect: (taskId: string) => void;
};

/**
 * DetailPanel ヘッダーで親タスクへの遷移リンクを表示するボタン。
 * @param props - 親タスクと選択コールバック
 * @returns 親タスク遷移ボタン
 */
export const ParentLink = (props: ParentLinkProps) => {
  const { parentTask, onSelect } = props;

  const displayTitle = parentTask.title || parentTask.filePath;

  /**
   * クリック時に親タスク id を渡して onSelect を呼ぶ。
   */
  const handleClick = () => {
    onSelect(parentTask.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`親タスクに遷移: ${displayTitle}`}
      data-testid="detail-parent-link"
      className="inline-flex max-w-full items-center rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface-muted hover:text-accent hover:underline focus:outline-none focus-visible:bg-surface-muted focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
    >
      <span className="truncate">親: {displayTitle}</span>
    </button>
  );
};
