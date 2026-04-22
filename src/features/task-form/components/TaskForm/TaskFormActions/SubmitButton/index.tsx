import type { ReactNode } from "react";
import { useContext } from "react";
import { Button } from "@/components/Button";
import { TaskFormActionsContext } from "..";

type SubmitButtonProps = {
  /** ボタン表示内容（通常はラベル文字列） */
  children?: ReactNode;
};

/**
 * 送信ボタン。
 * `type="submit"` を固定し、disabled は {@link TaskFormActionsContext} の isSubmitting を参照する。
 * form の onSubmit に委ねるため onClick は持たない。
 * @param props - {@link SubmitButtonProps}
 * @returns primary ボタン
 */
export const SubmitButton = ({ children }: SubmitButtonProps) => {
  const ctx = useContext(TaskFormActionsContext);
  const disabled = ctx?.isSubmitting ?? false;
  return (
    <Button
      variant="primary"
      type="submit"
      disabled={disabled}
      data-testid="task-form-submit"
    >
      {children}
    </Button>
  );
};
