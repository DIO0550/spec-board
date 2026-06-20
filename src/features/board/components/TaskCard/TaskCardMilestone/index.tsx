import { MilestoneBadge } from "../../MilestoneBadge";
import { useTaskCardContext } from "../TaskCardContext";

/**
 * TaskCard のマイルストーン行。task.milestone が無ければ何も描画しない。
 * @returns マイルストーンバッジ行 or null
 */
export const TaskCardMilestone = () => {
  const { task, milestonesByName } = useTaskCardContext();
  if (!task.milestone) {
    return null;
  }
  return (
    <div className="mt-1.5 flex">
      <MilestoneBadge
        name={task.milestone}
        definition={milestonesByName?.get(task.milestone)}
      />
    </div>
  );
};
