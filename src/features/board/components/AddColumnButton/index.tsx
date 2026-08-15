import { useInlineColumnNameInput } from "@/features/board/hooks/useInlineColumnNameInput";
import { useBoardColumn } from "../BoardColumnProvider";
import { ColumnNameInput } from "../ColumnNameInput";

const PlusIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="size-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

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
      <div className="flex h-fit w-[260px] min-w-[260px] flex-col gap-1 rounded-[10px] border border-border bg-surface-muted p-2.5 shadow-sm">
        <ColumnNameInput
          field={field}
          className="w-full rounded-md border border-accent bg-surface px-2 py-1.5 text-xs text-foreground outline-none ring-accent-soft focus:ring-[3px] disabled:bg-surface-muted"
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
      className="mt-1 inline-flex h-11 w-[260px] min-w-[260px] items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border-strong px-4 text-xs font-medium text-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft"
      data-testid="add-column-button"
    >
      <PlusIcon />
      <span>
        <span className="sr-only">+ </span>カラムを追加
      </span>
    </button>
  );
};
