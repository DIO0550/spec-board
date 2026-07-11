import { useInlineColumnNameInput } from "@/features/board/hooks/useInlineColumnNameInput";
import { useBoardColumn } from "../BoardColumnProvider";
import { ColumnNameInput } from "../ColumnNameInput";

/** AddColumnButton の Props */
type AddColumnButtonProps = {
  /**
   * 新規カラム追加時のコールバック。
   * 入力値の trim 後に空文字や既存と同名の場合は呼び出されない。
   * Promise を返した場合は await し、reject した場合は editor を開いたままにする。
   * @param columnName - 追加するカラム名（trim 済み）
   */
  onAdd: (columnName: string) => void | Promise<void>;
};

/**
 * ボード右端に表示される「+ カラムを追加」ボタン。
 * クリックでカラム名入力フィールドに切り替わり、
 * Enter で確定（onAdd 呼び出し）、Esc でキャンセルする。
 * 既存カラム名は BoardColumnProvider 経由で取得する。
 *
 * @param props - {@link AddColumnButtonProps}
 * @returns カラム追加ボタン要素
 */
export const AddColumnButton = ({ onAdd }: AddColumnButtonProps) => {
  const { existingNames } = useBoardColumn();
  const field = useInlineColumnNameInput({
    initialValue: "",
    existingNames,
    selectOnFocus: false,
    onCommit: (trimmed) => onAdd(trimmed),
  });

  if (field.isEditing) {
    return (
      <div className="flex h-fit w-72 min-w-72 flex-col gap-1 rounded-lg bg-surface-muted p-2">
        <ColumnNameInput
          field={field}
          className="w-full rounded border border-accent px-2 py-1 text-sm text-foreground outline-none disabled:bg-surface-muted"
          dataTestId="add-column-input"
          placeholder="カラム名"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={field.startEditing}
      aria-label="カラムを追加"
      className="h-fit w-72 min-w-72 rounded-lg border-2 border-dashed border-border px-4 py-2 text-sm text-muted hover:border-border hover:text-foreground"
      data-testid="add-column-button"
    >
      + カラムを追加
    </button>
  );
};
