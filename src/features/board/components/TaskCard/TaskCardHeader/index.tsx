import { DueBadge } from "@/components/DueBadge";
import { ParseErrorIcon } from "@/components/ParseErrorIcon";
import { WarningIcon } from "@/components/WarningIcon";
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
  const displayTitle = task.title || task.filePath;
  return (
    <div className="flex items-start gap-2">
      <PriorityBadge priority={task.priority} />
      <p
        data-testid="task-card-title"
        className="min-w-0 flex-1 break-words text-[13px] font-medium leading-[1.4] text-foreground"
      >
        {displayTitle}
      </p>
      <DraftBadge draft={task.draft} />
      <DueBadge due={task.due} />
      {(hasBrokenLink || hasParseError) && (
        <span className="flex shrink-0 gap-1 pt-0.5">
          {hasBrokenLink && <WarningIcon size={14} />}
          {hasParseError && <ParseErrorIcon size={14} />}
        </span>
      )}
    </div>
  );
};
