import type { DragEvent } from "react";
import { useRef } from "react";
import { ParseErrorIcon } from "@/components/ParseErrorIcon";
import { WarningIcon } from "@/components/WarningIcon";
import type { Task } from "@/types/task";
import { DRAG_MIME_TYPE } from "../Board/dragState";
import { LabelTag } from "../LabelTag";
import { PriorityBadge } from "../PriorityBadge";
import { SubIssueProgress } from "../SubIssueProgress";

/** タスクカードの Props */
type TaskCardProps = {
  /** 表示するタスク */
  task: Task;
  /** 子タスクの配列（直下子のみ。<details> 内一覧用） */
  childTasks?: readonly Task[];
  /** 全子孫タスク（X/Y サマリ + 進捗バー用、再帰展開済） */
  descendantTasks?: readonly Task[];
  /** 完了カラム名 */
  doneColumn?: string;
  /** 所属カラム名。onDragStart の引数に使う。 */
  fromColumn: string;
  /** ドラッグ中フラグ（Board の DragState から配布） */
  isDragging?: boolean;
  /**
   * 1 件でもリンク切れ参照を持つかどうか。true のときカード隅に警告アイコンのみを表示する。
   * 詳細はパネルで確認できるためカードはアイコンのみのミニマル表示にする。
   */
  hasBrokenLink?: boolean;
  /**
   * 1 件でもパースエラー警告（invalid 系コード）を持つかどうか。
   * true のときカード隅に赤いパースエラーアイコンを表示する（リンク切れアイコンと併存可）。
   */
  hasParseError?: boolean;
  /**
   * カードクリック時のコールバック
   * @param taskId - クリックされたタスクのID
   */
  onClick?: (taskId: string) => void;
  /**
   * ドラッグ開始時のコールバック。
   * @param taskFilePath - 対象タスクの filePath
   * @param fromColumn - 元カラム名
   */
  onDragStart?: (taskFilePath: string, fromColumn: string) => void;
  /** ドラッグ終了時のコールバック。 */
  onDragEnd?: () => void;
};

/**
 * タスクカード本体の表示。
 * @param props 表示用のタスク情報
 * @returns カード内 markup
 */
const CardContent = ({
  task,
  childTasks = [],
  descendantTasks,
  doneColumn = "Done",
  hasBrokenLink = false,
  hasParseError = false,
}: {
  task: Task;
  childTasks?: readonly Task[];
  descendantTasks?: readonly Task[];
  doneColumn?: string;
  hasBrokenLink?: boolean;
  hasParseError?: boolean;
}) => {
  // descendantTasks 未指定の呼出元では childTasks にフォールバック（直下子のみで集計）。
  // 本 PR 以前の振る舞いと同等になり、新規呼出元（Column）が descendantTasks を渡したときだけ
  // 全子孫ベースのカウントに切替わる。
  const effectiveDescendants = descendantTasks ?? childTasks;
  const displayTitle = task.title || task.filePath;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        <p data-testid="task-card-title" className="text-sm text-gray-800">
          {displayTitle}
        </p>
        {(hasBrokenLink || hasParseError) && (
          <span className="ml-auto flex shrink-0 gap-1">
            {hasBrokenLink && <WarningIcon size={14} />}
            {hasParseError && <ParseErrorIcon size={14} />}
          </span>
        )}
      </div>
      {task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <LabelTag key={label} label={label} />
          ))}
        </div>
      )}
      <SubIssueProgress
        childTasks={childTasks}
        descendantTasks={effectiveDescendants}
        doneColumn={doneColumn}
      />
    </>
  );
};

/**
 * タスクカードを表示する。onClick の有無に関わらず draggable な div を返す。
 * @param props - {@link TaskCardProps}
 * @returns カード要素
 */
export const TaskCard = ({
  task,
  childTasks,
  descendantTasks,
  doneColumn,
  fromColumn,
  isDragging = false,
  hasBrokenLink = false,
  hasParseError = false,
  onClick,
  onDragStart,
  onDragEnd,
}: TaskCardProps) => {
  const dragGuardRef = useRef(false);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(DRAG_MIME_TYPE, task.filePath);
    e.dataTransfer.effectAllowed = "move";
    dragGuardRef.current = true;
    onDragStart?.(task.filePath, fromColumn);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
    setTimeout(() => {
      dragGuardRef.current = false;
    }, 0);
  };

  const draggingClass = isDragging ? " opacity-40" : "";
  const dataDragging = isDragging ? "true" : undefined;

  if (!onClick) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 native DnD requires draggable handlers on the card container; CardContent may include interactive descendants so a semantic element is unsuitable
      <div
        draggable
        data-dragging={dataDragging}
        data-testid="task-card"
        aria-grabbed={isDragging}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm${draggingClass}`}
      >
        <CardContent
          task={task}
          childTasks={childTasks}
          descendantTasks={descendantTasks}
          doneColumn={doneColumn}
          hasBrokenLink={hasBrokenLink}
          hasParseError={hasParseError}
        />
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: CardContent may include interactive descendants such as details/summary, so a semantic <button> cannot be used as the card container
    <div
      draggable
      data-dragging={dataDragging}
      data-testid="task-card"
      aria-grabbed={isDragging}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      role="button"
      tabIndex={0}
      className={`w-full cursor-pointer rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-blue-300 hover:shadow-md${draggingClass}`}
      onClick={() => {
        if (dragGuardRef.current) {
          return;
        }
        onClick(task.id);
      }}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) {
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(task.id);
        }
      }}
    >
      <CardContent
        task={task}
        childTasks={childTasks}
        descendantTasks={descendantTasks}
        doneColumn={doneColumn}
        hasBrokenLink={hasBrokenLink}
        hasParseError={hasParseError}
      />
    </div>
  );
};
