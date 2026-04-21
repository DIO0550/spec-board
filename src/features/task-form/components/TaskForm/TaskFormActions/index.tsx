import { Button } from "@/components/Button";

type TaskFormActionsProps = {
  /** 送信ボタンのラベル */
  submitLabel: string;
  /** キャンセルボタンのラベル */
  cancelLabel: string;
  /** キャンセル時のコールバック */
  onCancel: () => void;
  /** 送信中（true の間は両ボタンが無効化される） */
  isSubmitting: boolean;
};

/**
 * タスクフォームのアクション領域。キャンセルボタンと送信ボタンを並べる。
 * 共通 Button コンポーネントを利用。送信ボタンは `type="submit"` を明示指定する。
 * @param props - {@link TaskFormActionsProps}
 * @returns ボタン列 UI
 */
export const TaskFormActions = ({
  submitLabel,
  cancelLabel,
  onCancel,
  isSubmitting,
}: TaskFormActionsProps) => {
  return (
    <div className="mt-2 flex justify-end gap-3">
      <Button
        variant="secondary"
        disabled={isSubmitting}
        onClick={onCancel}
        data-testid="task-form-cancel"
      >
        {cancelLabel}
      </Button>
      <Button
        variant="primary"
        type="submit"
        disabled={isSubmitting}
        data-testid="task-form-submit"
      >
        {submitLabel}
      </Button>
    </div>
  );
};
