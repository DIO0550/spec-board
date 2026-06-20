import { useTaskCardContext } from "../TaskCardContext";

/**
 * TaskCard のフッター。task.id 常時表示と、links / subIssue 件数の条件表示を行う。
 * @returns フッター行
 */
export const TaskCardFooter = () => {
  const { task, subIssueCounts } = useTaskCardContext();
  const linkCount = task.links.linkedFilePaths.length;
  const { done, total } = subIssueCounts;
  return (
    <footer className="mt-2 flex items-center gap-2 text-xs text-muted">
      <span className="min-w-0 truncate" data-testid="task-card-id">
        {task.id}
      </span>
      {linkCount > 0 && (
        <span className="shrink-0" data-testid="task-card-link-count">
          🔗 {linkCount}
        </span>
      )}
      {total > 0 && (
        <span className="shrink-0" data-testid="task-card-subissue-count">
          {done}/{total}
        </span>
      )}
    </footer>
  );
};
