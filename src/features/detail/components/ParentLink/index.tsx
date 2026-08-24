import type { Task, TaskId } from "@/types/task";

/** ParentLink の Props */
export type ParentLinkProps = {
  /** 遷移先となる親タスク */
  parentTask: Task;
  /**
   * 親タスク選択時のコールバック。
   * @param taskId - 遷移先となる親タスクの id
   */
  onSelect: (taskId: TaskId) => void;
};

/**
 * DetailScreen ヘッダーで親タスクへの遷移リンクを表示するボタン。
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
      className="flex mx-[10px] my-2 w-auto max-w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-muted hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
    >
      <span className="truncate">親: {displayTitle}</span>
    </button>
  );
};
