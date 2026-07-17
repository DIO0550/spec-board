import { DueBadge } from "@/components/DueBadge";
import { ParseErrorIcon } from "@/components/ParseErrorIcon";
import { WarningIcon } from "@/components/WarningIcon";
import { Task } from "@/domains/task";
import { DraftBadge } from "../../DraftBadge";
import { PriorityBadge } from "../../PriorityBadge";
import { useTaskCardContext } from "../TaskCardContext";

/**
 * TaskCard のヘッダー行。Draft / Priority / Due バッジとタイトル、
 * 警告アイコン群（リンク切れ / パースエラー）を描画する。
 * @returns ヘッダー行
 */
export const TaskCardHeader = () => {
  const { task, hasBrokenLink, hasParseError } = useTaskCardContext();
  const displayTitle = Task.displayTitle(task);
  return (
    <div className="flex items-center gap-1.5">
      <DraftBadge draft={task.draft} />
      <PriorityBadge priority={task.priority} />
      <DueBadge due={task.due} />
      <p data-testid="task-card-title" className="text-sm text-foreground">
        {displayTitle}
      </p>
      {(hasBrokenLink || hasParseError) && (
        <span className="ml-auto flex shrink-0 gap-1">
          {hasBrokenLink && <WarningIcon size={14} />}
          {hasParseError && <ParseErrorIcon size={14} />}
        </span>
      )}
    </div>
  );
};
