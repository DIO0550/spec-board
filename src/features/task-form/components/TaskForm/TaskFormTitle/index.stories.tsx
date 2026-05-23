// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
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

export const WithDuplicateError: Story = {
  args: {
    value: "Fix login bug",
    error: { code: "DUPLICATE", fileName: "fix-login-bug.md" },
  },
};

export const WithTooLongError: Story = {
  args: {
    value: "a".repeat(201),
    error: { code: "TOO_LONG", max: 200, actual: 201 },
  },
};

export const WithForbiddenCharError: Story = {
  args: {
    value: "a<b>c",
    error: { code: "FORBIDDEN_CHAR", chars: ["<", ">"] },
  },
};
