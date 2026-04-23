import type { ReactNode } from "react";
import { Button } from "@/components/Button";

type SubmitButtonProps = {
  /** 無効化 */
  disabled?: boolean;
  /** ボタン表示内容（通常はラベル文字列） */
  children?: ReactNode;
};

/**
 * 送信ボタン。`type="submit"` を固定し、form の onSubmit に送信を委ねる。
 * @param props - {@link SubmitButtonProps}
 * @returns primary ボタン
 */
export const SubmitButton = ({
  disabled = false,
  children,
}: SubmitButtonProps) => {
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
