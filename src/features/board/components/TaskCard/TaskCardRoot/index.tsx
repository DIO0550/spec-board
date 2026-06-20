// @lint-suppress-ok — HTML5 ネイティブ DnD のため draggable ハンドラを <div> に
// 付ける必要があり、`noStaticElementInteractions` が trigger される。子に
// details/summary 等の interactive descendants が混ざるため <button> 等の
// セマンティック要素に置換できず、抑制が必須。旧 TaskCard/index.tsx から踏襲。
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
} from "react";
import { DEFAULT_DONE_COLUMN } from "@/domains/project-columns";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import { DRAG_MIME_TYPE } from "@/features/board/components/Board/mime";
import { useBoardCard } from "@/features/board/components/BoardCardProvider";
import type { Task } from "@/types/task";
import {
  type MilestonesByName,
  TaskCardContext,
  type TaskCardContextValue,
} from "../TaskCardContext";

// childTasks / descendantTasks 未指定時のフォールバック用に参照を固定する。
// 毎レンダー `[]` リテラルを生成すると useMemo の依存比較が常に miss し、
// Context Value の memo 化（Column の tasks.map での再描画抑制）が壊れる。
const EMPTY_TASKS: readonly Task[] = [];

/** TaskCardRoot の Props */
export type TaskCardRootProps = {
  /** 表示するタスク */
  task: Task;
  /** 子タスクの配列（直下子のみ。<details> 内一覧用） */
  childTasks?: readonly Task[];
  /** 全子孫タスク（X/Y サマリ + 進捗バー用、再帰展開済） */
  descendantTasks?: readonly Task[];
  /** 完了カラム名 */
  doneColumn?: string;
  /** name → マイルストーン定義の Map。未指定は name 表示にフォールバック */
  milestonesByName?: MilestonesByName;
  /** 所属カラム名。startDrag の引数に使う */
  fromColumn: string;
  /** 1 件でもリンク切れ参照を持つかどうか */
  hasBrokenLink?: boolean;
  /** 1 件でもパースエラー警告を持つかどうか */
  hasParseError?: boolean;
  /**
   * カードクリック時のコールバック
   * @param taskId クリックされたタスクの id
   */
  onClick?: (taskId: string) => void;
  /** 並べるサブ部品（TaskCard.Header 等） */
  children: ReactNode;
};

/**
 * TaskCard の Container + Context Provider。draggable コンテナとして DnD を司り、
 * 子サブ部品が利用する横断データを Provider 経由で配布する。
 * @param props - {@link TaskCardRootProps}
 * @returns カード要素
 */
export const TaskCardRoot = ({
  task,
  childTasks,
  descendantTasks,
  doneColumn,
  milestonesByName,
  fromColumn,
  hasBrokenLink = false,
  hasParseError = false,
  onClick,
  children,
}: TaskCardRootProps) => {
  const card = useBoardCard();
  // ドラッグ終了直後にブラウザが発火する synthetic click を抑止するためのガード。
  // dragstart で true にし、onClick はこのフラグが立っている間は無視する。
  const dragGuardRef = useRef(false);

  const effectiveDoneColumn = doneColumn ?? DEFAULT_DONE_COLUMN;
  // childTasks が undefined のときはもちろん、Column 側が `?? []` で都度生成した
  // 空配列を渡しても useMemo が miss しないよう、length === 0 も EMPTY_TASKS に
  // 正規化する。子なしタスクが大量に並ぶケース（典型的な Column 描画）で効く。
  const effectiveChildTasks =
    childTasks === undefined || childTasks.length === 0
      ? EMPTY_TASKS
      : childTasks;
  const effectiveDescendants =
    descendantTasks === undefined || descendantTasks.length === 0
      ? effectiveChildTasks
      : descendantTasks;

  const subIssueCounts = useMemo(
    () =>
      TaskHierarchy.countSubIssueProgress(
        effectiveDescendants,
        effectiveDoneColumn,
      ),
    [effectiveDescendants, effectiveDoneColumn],
  );

  const contextValue = useMemo<TaskCardContextValue>(
    () => ({
      task,
      doneColumn: effectiveDoneColumn,
      milestonesByName,
      hasBrokenLink,
      hasParseError,
      subIssueCounts,
      childTasks: effectiveChildTasks,
      descendantTasks: effectiveDescendants,
    }),
    [
      task,
      effectiveDoneColumn,
      milestonesByName,
      hasBrokenLink,
      hasParseError,
      subIssueCounts,
      effectiveChildTasks,
      effectiveDescendants,
    ],
  );

  const isDragging = card.isDragging(task.filePath);
  const dndDisabled = card.dndDisabled;

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (dndDisabled) {
      return;
    }
    e.dataTransfer.setData(DRAG_MIME_TYPE, task.filePath);
    e.dataTransfer.effectAllowed = "move";
    dragGuardRef.current = true;
    card.startDrag(task.filePath, fromColumn);
  };

  const handleDragEnd = () => {
    card.end();
    // dragend 内 setTimeout(0) で解除を次のマクロタスクに回し、synthetic click を確実にガードする。
    setTimeout(() => {
      dragGuardRef.current = false;
    }, 0);
  };

  const draggingClass = isDragging ? " opacity-40" : "";
  // ドラッグ中は dragging の減光を優先し draft の opacity を重ねない。
  const draftClass = !isDragging && task.draft ? " opacity-60" : "";
  const dataDragging = isDragging ? "true" : undefined;
  const interactiveClass = onClick
    ? " cursor-pointer hover:border-accent hover:shadow-md"
    : "";

  const handleClick = onClick
    ? () => {
        if (dragGuardRef.current) {
          return;
        }
        onClick(task.id);
      }
    : undefined;

  const handleKeyDown = onClick
    ? (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.currentTarget !== e.target) {
          return;
        }
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(task.id);
        }
      }
    : undefined;

  return (
    <TaskCardContext.Provider value={contextValue}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: HTML5 native DnD requires draggable handlers on the card container; children may include interactive descendants (e.g. details/summary) so a semantic <button> cannot be used here */}
      <div
        draggable={!dndDisabled}
        data-dragging={dataDragging}
        data-testid="task-card"
        aria-grabbed={isDragging}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-lg border border-border bg-surface p-3 text-left shadow-sm${interactiveClass}${draggingClass}${draftClass}`}
      >
        {children}
      </div>
    </TaskCardContext.Provider>
  );
};
