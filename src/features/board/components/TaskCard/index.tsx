import type { DragEvent } from "react";
import { useRef } from "react";
import { DueBadge } from "@/components/DueBadge";
import { ParseErrorIcon } from "@/components/ParseErrorIcon";
import { WarningIcon } from "@/components/WarningIcon";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import type { MilestoneDefinition } from "@/lib/tauri";
import type { Task } from "@/types/task";
import { DRAG_MIME_TYPE } from "../Board/dragState";
import { DraftBadge } from "../DraftBadge";
import { LabelTag } from "../LabelTag";
import { MilestoneBadge } from "../MilestoneBadge";
import { PriorityBadge } from "../PriorityBadge";
import { SubIssueProgress } from "../SubIssueProgress";

/** name → マイルストーン定義の Map（バッジ表示用）。 */
export type MilestonesByName = Map<string, MilestoneDefinition>;

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
  /** name → マイルストーン定義の Map（バッジの title/due 解決用。未指定は name 表示） */
  milestonesByName?: MilestonesByName;
  /** 所属カラム名。onDragStart の引数に使う。 */
  fromColumn: string;
  /** ドラッグ中フラグ（Board の DragState から配布） */
  isDragging?: boolean;
  /**
   * ドラッグを無効化するか。フィルタ有効時など、表示集合が全タスクと異なり
   * 並べ替えが cardOrder を壊しうる状況で true にしてカードのドラッグを止める。
   */
  disableDrag?: boolean;
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
  milestonesByName,
  hasBrokenLink = false,
  hasParseError = false,
}: {
  task: Task;
  childTasks?: readonly Task[];
  descendantTasks?: readonly Task[];
  doneColumn?: string;
  milestonesByName?: MilestonesByName;
  hasBrokenLink?: boolean;
  hasParseError?: boolean;
}) => {
  // descendantTasks を渡せば全子孫ベースで進捗を集計する。未指定なら childTasks に
  // フォールバックし、直下子のみで集計する。
  const effectiveDescendants = descendantTasks ?? childTasks;
  const displayTitle = task.title || task.filePath;
  const linkCount = task.links.linkedFilePaths.length;
  const { done, total } = TaskHierarchy.countSubIssueProgress(
    effectiveDescendants,
    doneColumn,
  );

  return (
    <>
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
      {task.milestone ? (
        <div className="mt-1.5 flex">
          <MilestoneBadge
            name={task.milestone}
            definition={milestonesByName?.get(task.milestone)}
          />
        </div>
      ) : null}
      {task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <LabelTag key={label} label={label} />
          ))}
        </div>
      )}
      <SubIssueProgress
        childTasks={childTasks}
        done={done}
        total={total}
        doneColumn={doneColumn}
      />
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
  milestonesByName,
  fromColumn,
  isDragging = false,
  disableDrag = false,
  hasBrokenLink = false,
  hasParseError = false,
  onClick,
  onDragStart,
  onDragEnd,
}: TaskCardProps) => {
  const dragGuardRef = useRef(false);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (disableDrag) {
      return;
    }
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
  // ドラッグ中は dragging の減光を優先し、draft の opacity は重ねない
  // （opacity-40 × opacity-60 の重複減光を避ける）。
  const draftClass = !isDragging && task.draft ? " opacity-60" : "";
  const dataDragging = isDragging ? "true" : undefined;

  if (!onClick) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 native DnD requires draggable handlers on the card container; CardContent may include interactive descendants so a semantic element is unsuitable
      <div
        draggable={!disableDrag}
        data-dragging={dataDragging}
        data-testid="task-card"
        aria-grabbed={isDragging}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={`w-full rounded-lg border border-border bg-surface p-3 text-left shadow-sm${draggingClass}${draftClass}`}
      >
        <CardContent
          task={task}
          childTasks={childTasks}
          descendantTasks={descendantTasks}
          doneColumn={doneColumn}
          milestonesByName={milestonesByName}
          hasBrokenLink={hasBrokenLink}
          hasParseError={hasParseError}
        />
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: CardContent may include interactive descendants such as details/summary, so a semantic <button> cannot be used as the card container
    <div
      draggable={!disableDrag}
      data-dragging={dataDragging}
      data-testid="task-card"
      aria-grabbed={isDragging}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      role="button"
      tabIndex={0}
      className={`w-full cursor-pointer rounded-lg border border-border bg-surface p-3 text-left shadow-sm hover:border-accent hover:shadow-md${draggingClass}${draftClass}`}
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
        milestonesByName={milestonesByName}
        hasBrokenLink={hasBrokenLink}
        hasParseError={hasParseError}
      />
    </div>
  );
};
