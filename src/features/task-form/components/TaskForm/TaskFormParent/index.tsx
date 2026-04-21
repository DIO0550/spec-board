import type { Task } from "@/types/task";
import { ParentTaskSelect } from "../../ParentTaskSelect";

type TaskFormParentProps = {
  /** 選択候補となるタスク一覧 */
  tasks: Task[];
  /** 現在選択中の親タスクのファイルパス（未選択時は undefined） */
  value: string | undefined;
  /**
   * 選択変更時のコールバック。
   * @param value - 新しい値
   */
  onChange: (value: string | undefined) => void;
  /** 無効化 */
  disabled: boolean;
};

/**
 * 親タスク選択フィールド。
 * 表示・検索 UI は既存 `ParentTaskSelect` に委譲し、本コンポーネントは TaskForm 側の
 * props を `ParentTaskSelect` の prop 名に橋渡しするだけの薄いラッパー。
 * @param props - {@link TaskFormParentProps}
 * @returns 親タスク選択 UI
 */
export const TaskFormParent = ({
  tasks,
  value,
  onChange,
  disabled,
}: TaskFormParentProps) => {
  return (
    <ParentTaskSelect
      tasks={tasks}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
};
