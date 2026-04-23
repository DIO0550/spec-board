import type { ReactNode } from "react";

type TaskFormActionsProps = {
  /** キャンセルボタンと送信ボタンを compose する slot */
  children?: ReactNode;
};

/**
 * タスクフォームのアクション領域のレイアウト枠。
 * ボタンの並びだけを担い、disabled 等の配線は caller で {@link CancelButton} /
 * {@link SubmitButton} に明示的に props を渡す。
 * @param props - {@link TaskFormActionsProps}
 * @returns ボタン列レイアウト
 */
export const TaskFormActions = ({ children }: TaskFormActionsProps) => {
  return <div className="mt-2 flex justify-end gap-3">{children}</div>;
};
