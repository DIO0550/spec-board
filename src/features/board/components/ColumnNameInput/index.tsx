import type { UseInlineColumnNameInputResult } from "@/features/board/hooks/useInlineColumnNameInput";

/**
 * ColumnNameInput の Props。
 * フックの配線束（getInputProps）と表示に必要な isDuplicate / errorId は
 * `field` 1 つに集約し、見た目差分（className / dataTestId / placeholder / dndDisabled）
 * だけを個別 props にする。フック戻り値をそのまま `field={field}` で渡せる。
 */
export type ColumnNameInputProps = {
  /** useInlineColumnNameInput の戻り値。getInputProps / isDuplicate / errorId のみ使う */
  field: Pick<
    UseInlineColumnNameInputResult,
    "getInputProps" | "isDuplicate" | "errorId"
  >;
  /** input 自身の className（外枠 wrapper は呼び出し側が持つ） */
  className: string;
  /** input の data-testid（column-rename-input / add-column-input） */
  dataTestId: string;
  /** プレースホルダ（AddColumnButton のみ "カラム名"） */
  placeholder?: string;
  /** ColumnHeader の input のみに付く data-column-dnd-disabled を出すか（DnD 識別属性） */
  dndDisabled?: boolean;
};

/**
 * カラム名インライン入力の presentational コンポーネント。
 * `<input>` + 重複エラー `<p role="alert">` のみを描画し、外枠 wrapper は呼び出し側が持つ。
 * 配線（value / onChange / onKeyDown / onBlur / disabled / ref / aria-*）は
 * `field.getInputProps()` の spread に載る。
 * @param props - {@link ColumnNameInputProps}
 * @returns input + 条件付きエラー要素
 */
export const ColumnNameInput = ({
  field,
  className,
  dataTestId,
  placeholder,
  dndDisabled = false,
}: ColumnNameInputProps) => {
  return (
    <>
      <input
        {...field.getInputProps()}
        type="text"
        className={className}
        placeholder={placeholder}
        data-testid={dataTestId}
        {...(dndDisabled ? { "data-column-dnd-disabled": true } : {})}
      />
      {field.isDuplicate && (
        <p id={field.errorId} className="text-xs text-red-500" role="alert">
          同じ名前のカラムが既に存在します
        </p>
      )}
    </>
  );
};
