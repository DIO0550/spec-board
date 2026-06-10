// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TITLE_MAX_LENGTH } from "@/features/task-form/lib/fields/title";
import { TaskFormTitle } from ".";

const meta: Meta<typeof TaskFormTitle> = {
  component: TaskFormTitle,
  args: {
    value: "ログイン画面のバグ修正",
    disabled: false,
    onChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormTitle>;

export const Default: Story = {};

export const WithEmptyError: Story = {
  args: { value: "", error: { code: "EMPTY" } },
};

export const WithTooLongError: Story = {
  args: {
    value: "a".repeat(TITLE_MAX_LENGTH + 1),
    error: {
      code: "TOO_LONG",
      max: TITLE_MAX_LENGTH,
      actual: TITLE_MAX_LENGTH + 1,
    },
  },
};

export const WithForbiddenCharError: Story = {
  args: {
    value: "a<b>c",
    error: { code: "FORBIDDEN_CHAR", chars: ["<", ">"] },
  },
};
