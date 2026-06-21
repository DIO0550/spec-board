import type { ReactNode } from "react";
import { TaskCardFooter } from "./TaskCardFooter";
import { TaskCardHeader } from "./TaskCardHeader";
import { TaskCardLabels } from "./TaskCardLabels";
import { TaskCardMilestone } from "./TaskCardMilestone";
import { TaskCardProgress } from "./TaskCardProgress";
import { TaskCardRoot, type TaskCardRootProps } from "./TaskCardRoot";

export type { MilestonesByName } from "./TaskCardContext";

/**
 * 旧 API 互換の props 型。`TaskCardRootProps` から `children` を除いた残り全部を
 * そのまま受け継ぐ。spread を避け explicit destructure で渡すため、将来
 * `TaskCardRootProps` に内部用 prop を増やした場合の余剰 prop 漏出を防げる。
 */
type TaskCardProps = Omit<TaskCardRootProps, "children">;

/**
 * 旧 API 互換のタスクカード。{@link TaskCardRoot} に props を転送し、
 * 5 つの子サブ部品（Header / Milestone / Labels / Progress / Footer）を
 * 既定の順序で並べる。新 API は {@link TaskCard} の `.Root` / `.Header` 等を直接使う。
 * @param props - {@link TaskCardProps}
 * @returns カード要素
 */
const TaskCardLegacy = ({
  task,
  fromColumn,
  hasBrokenLink,
  hasParseError,
  onClick,
  childTasks,
}: TaskCardProps) => (
  <TaskCardRoot
    task={task}
    fromColumn={fromColumn}
    hasBrokenLink={hasBrokenLink}
    hasParseError={hasParseError}
    onClick={onClick}
    childTasks={childTasks}
  >
    <TaskCardHeader />
    <TaskCardMilestone />
    <TaskCardLabels />
    <TaskCardProgress />
    <TaskCardFooter />
  </TaskCardRoot>
);

/** Compound コンポーネント本体（Root + 5 サブ部品の名前空間） */
type TaskCardComponent = ((props: TaskCardProps) => ReactNode) & {
  Root: typeof TaskCardRoot;
  Header: typeof TaskCardHeader;
  Milestone: typeof TaskCardMilestone;
  Labels: typeof TaskCardLabels;
  Progress: typeof TaskCardProgress;
  Footer: typeof TaskCardFooter;
};

/**
 * タスクカード（Compound コンポーネント）。
 * `<TaskCard task ... />` の形は旧 API ラッパで Compound パーツを既定順序で展開する。
 * `<TaskCard.Root task ...><TaskCard.Header />...</TaskCard.Root>` は新 API として
 * 並べ替え自由度を提供する。両者は内部で同じ {@link TaskCardRoot} を呼ぶ。
 */
export const TaskCard: TaskCardComponent = Object.assign(TaskCardLegacy, {
  Root: TaskCardRoot,
  Header: TaskCardHeader,
  Milestone: TaskCardMilestone,
  Labels: TaskCardLabels,
  Progress: TaskCardProgress,
  Footer: TaskCardFooter,
});
