// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TaskFormLabels } from ".";
import { LabelChip } from "./LabelChip";
import { LabelInput } from "./LabelInput";

const meta: Meta<typeof TaskFormLabels> = {
  component: TaskFormLabels,
  args: {
    htmlFor: "task-form-labels-input",
    children: (
      <>
        <LabelChip label="bug" onRemove={() => {}} />
        <LabelChip label="frontend" onRemove={() => {}} />
        <LabelInput
          id="task-form-labels-input"
          value=""
          onChange={() => {}}
          onKeyDown={() => {}}
          onBlur={() => {}}
        />
      </>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof TaskFormLabels>;

export const Default: Story = {};
