import type { ReactNode } from "react";
import { createContext } from "react";

type TaskFormActionsContextValue = {
  isSubmitting: boolean;
};

/**
 * TaskFormActions 配下の CancelButton / SubmitButton が参照する context。
 * isSubmitting を共有し、ボタン側で disabled 配線を完結させる。
 */
export const TaskFormActionsContext =
  createContext<TaskFormActionsContextValue | null>(null);

type TaskFormActionsProps = {
  /** 送信中（true の間は配下のボタン群が disabled になる） */
  isSubmitting: boolean;
  /** キャンセルボタンと送信ボタンを compose する slot */
  children?: ReactNode;
};

/**
 * タスクフォームのアクション領域。ボタンの並びと disabled 配線だけを担う compound コンポーネント。
 * 配下には {@link CancelButton} と {@link SubmitButton} を compose する想定で、
 * 送信ボタンの `type="submit"` や disabled 同期は各子コンポーネントが context 経由で担う。
 * @param props - {@link TaskFormActionsProps}
 * @returns ボタン列レイアウト
 */
export const TaskFormActions = ({
  isSubmitting,
  children,
}: TaskFormActionsProps) => {
  return (
    <TaskFormActionsContext.Provider value={{ isSubmitting }}>
      <div className="mt-2 flex justify-end gap-3">{children}</div>
    </TaskFormActionsContext.Provider>
  );
};
