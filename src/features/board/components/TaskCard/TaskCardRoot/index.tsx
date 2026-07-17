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
import type { Task } from "@/domains/task";
import { DRAG_MIME_TYPE } from "@/features/board/components/Board/mime";
import { useBoardCard } from "@/features/board/components/BoardCardProvider";
import { TaskCardContext, type TaskCardContextValue } from "../TaskCardContext";

/** 子なしタスク用に固定参照を返す空配列。 */
const EMPTY_TASKS: readonly Task[] = [];

/** TaskCardRoot の Props */
export type TaskCardRootProps = {
  /** 表示するタスク */
  task: Task;
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
  /**
   * 直下子タスクの配列（<details> 内の一覧表示用）。Provider 経由で descendantCount は
   * 取得するため再帰展開は不要だが、サブ部品が直下子のみを参照するケースで必要なら渡す。
   */
  childTasks?: readonly Task[];
  /** 並べるサブ部品（TaskCard.Header 等） */
  children: ReactNode;
};

/**
 * TaskCard の Container + Context Provider。draggable コンテナとして DnD を司り、
 * 子サブ部品が利用する横断データを Provider 経由で配布する。
 * doneColumn / milestonesByName / subIssueCounts は BoardCardProvider から取得する。
 *
 * @param props - {@link TaskCardRootProps}
 * @returns カード要素
 */
export const TaskCardRoot = ({
  task,
  fromColumn,
  hasBrokenLink = false,
  hasParseError = false,
  onClick,
  childTasks,
  children,
}: TaskCardRootProps) => {
  const card = useBoardCard();
  // ドラッグ終了直後にブラウザが発火する synthetic click を抑止するためのガード。
  // dragstart で true にし、onClick はこのフラグが立っている間は無視する。
  const dragGuardRef = useRef(false);

  const effectiveChildTasks =
    childTasks === undefined || childTasks.length === 0
      ? EMPTY_TASKS
      : childTasks;

  const subIssueCounts = card.descendantCount(task.filePath);

  const contextValue = useMemo<TaskCardContextValue>(
    () => ({
      task,
      doneColumn: card.doneColumn,
      milestonesByName: card.milestonesByName,
      hasBrokenLink,
      hasParseError,
      subIssueCounts,
      childTasks: effectiveChildTasks,
    }),
    [
      task,
      card.doneColumn,
      card.milestonesByName,
      hasBrokenLink,
      hasParseError,
      subIssueCounts,
      effectiveChildTasks,
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
