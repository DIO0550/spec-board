import type { ReactNode } from "react";
import { useContext } from "react";
import { Button } from "@/components/Button";
import { TaskFormActionsContext } from "..";

type CancelButtonProps = {
  /** click コールバック */
  onClick: () => void;
  /** ボタン表示内容（通常はラベル文字列） */
  children?: ReactNode;
};

/**
 * キャンセルボタン。
 * disabled は {@link TaskFormActionsContext} の isSubmitting を参照する。
 * @param props - {@link CancelButtonProps}
 * @returns secondary ボタン
 */
export const CancelButton = ({ onClick, children }: CancelButtonProps) => {
  const ctx = useContext(TaskFormActionsContext);
  const disabled = ctx?.isSubmitting ?? false;
  return (
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={onClick}
      data-testid="task-form-cancel"
    >
      {children}
    </Button>
  );
};
