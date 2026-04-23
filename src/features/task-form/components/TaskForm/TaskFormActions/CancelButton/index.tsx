import type { ReactNode } from "react";
import { Button } from "@/components/Button";

type CancelButtonProps = {
  /** click コールバック */
  onClick: () => void;
  /** 無効化 */
  disabled?: boolean;
  /** ボタン表示内容（通常はラベル文字列） */
  children?: ReactNode;
};

/**
 * キャンセルボタン。
 * @param props - {@link CancelButtonProps}
 * @returns secondary ボタン
 */
export const CancelButton = ({
  onClick,
  disabled = false,
  children,
}: CancelButtonProps) => {
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
