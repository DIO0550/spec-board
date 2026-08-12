import { LabelTag } from "../../LabelTag";
import { useTaskCardContext } from "../TaskCardContext";

/**
 * TaskCard のラベル行。task.labels が空なら何も描画しない。
 * @returns ラベル行 or null
 */
export const TaskCardLabels = () => {
  const { task } = useTaskCardContext();
  if (task.labels.length === 0) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {task.labels.map((label) => (
        <LabelTag key={label} label={label} />
      ))}
    </div>
  );
};
