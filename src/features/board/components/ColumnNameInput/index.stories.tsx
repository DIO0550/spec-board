import type { Meta, StoryObj } from "@storybook/react-vite";
import { createRef } from "react";
import { fn } from "storybook/test";
import { ColumnNameInput } from ".";

const inputProps = {
  ref: createRef<HTMLInputElement>(),
  value: "Todo",
  onChange: fn(),
  onKeyDown: fn(),
  onBlur: fn(),
  disabled: false,
  "aria-label": "カラム名",
  "aria-invalid": false,
  "aria-describedby": undefined,
};
const meta = {
  component: ColumnNameInput,
  args: {
    field: {
      /** @returns 入力要素へ渡す props */
      getInputProps: () => inputProps,
      isDuplicate: false,
      errorId: "column-name-error",
    },
    className: "rounded border border-border px-2 py-1 text-sm",
    dataTestId: "column-name-story",
  },
} satisfies Meta<typeof ColumnNameInput>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AllProps: Story = {
  args: { placeholder: "カラム名", dndDisabled: true },
};
export const EdgeCases: Story = {
  args: {
    field: {
      /** @returns 既存カラムと重複する値を入れた props */
      getInputProps: () => ({ ...inputProps, value: "Todo" }),
      isDuplicate: true,
      errorId: "duplicate-column-error",
    },
  },
};
