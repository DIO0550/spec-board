import { TaskSelect } from "@/components/TaskSelect";
import type { Task } from "@/types/task";

type ParentTaskSelectProps = {
  /** 選択候補となるタスク一覧 */
  tasks: Task[];
  /** 現在選択中の親タスクのファイルパス（未選択時は undefined） */
  value: string | undefined;
  /**
   * 選択変更時のコールバック
   * @param filePath - 選択されたタスクのファイルパス（解除時は undefined）
   */
  onChange: (filePath: string | undefined) => void;
  /** 無効化（送信中など） */
  disabled?: boolean;
  /**
   * 親フィールドを変更不可にする。
   * true のとき × ボタンを描画しない。さらに `value === undefined` の場合も
   * 検索 input は描画されず、未設定 placeholder のみ表示する（props 単体で
   * 「変更不可」契約を自己完結させる）。
   * disabled と直交し、両方 true でも独立に効く。
   */
  readOnly?: boolean;
};

/**
 * 既存タスクから親タスクを検索・選択するコンポーネント。
 * 共通 {@link TaskSelect} を `testIdPrefix="parent-task"` で wrap し、
 * value: string | undefined ↔ TaskSelect: string | null を変換する。
 *
 * @param props - {@link ParentTaskSelectProps}
 * @returns 親タスク選択 UI
 */
export const ParentTaskSelect = ({
  tasks,
  value,
  onChange,
  disabled = false,
  readOnly = false,
}: ParentTaskSelectProps) => {
  return (
    <TaskSelect
      tasks={tasks}
      value={value ?? null}
      onChange={(filePath) => onChange(filePath ?? undefined)}
      disabled={disabled}
      readOnly={readOnly}
      label="親タスク"
      placeholder="タスクを検索して選択"
      testIdPrefix="parent-task"
    />
  );
};
