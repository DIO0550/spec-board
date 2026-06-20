// @lint-suppress-ok
// 本ファイルの biome-ignore は HTML5 ネイティブ DnD のための a11y 制約に由来する。
// 旧 TaskCard/index.tsx から踏襲しており、互換性維持のため削除しない。
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
} from "react";
import { DEFAULT_DONE_COLUMN } from "@/domains/project-columns";
import { TaskHierarchy } from "@/domains/task-hierarchy";
import type { Task } from "@/types/task";
import { DRAG_MIME_TYPE } from "../../Board/dragState";
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
  /** 所属カラム名。onDragStart の引数に使う */
  fromColumn: string;
  /** ドラッグ中フラグ（Board の DragState から配布） */
  isDragging?: boolean;
  /** ドラッグを無効化するか */
  disableDrag?: boolean;
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
   * ドラッグ開始時のコールバック
   * @param taskFilePath 対象タスクの filePath
   * @param fromColumn 元カラム名
   */
  onDragStart?: (taskFilePath: string, fromColumn: string) => void;
  /** ドラッグ終了時のコールバック */
  onDragEnd?: () => void;
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
  isDragging = false,
  disableDrag = false,
  hasBrokenLink = false,
  hasParseError = false,
  onClick,
  onDragStart,
  onDragEnd,
  children,
}: TaskCardRootProps) => {
  // ドラッグ終了直後にブラウザが発火する synthetic click を抑止するためのガード。
  // dragstart で true にし、onClick はこのフラグが立っている間は無視する。
  const dragGuardRef = useRef(false);

  const effectiveDoneColumn = doneColumn ?? DEFAULT_DONE_COLUMN;
  const effectiveChildTasks = childTasks ?? EMPTY_TASKS;
  const effectiveDescendants = descendantTasks ?? effectiveChildTasks;

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
        draggable={!disableDrag}
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
