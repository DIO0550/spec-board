// @jsdoc-rules-disable
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LabelDefinition } from "@/domains/label-definition";
import { LabelsField } from ".";

const meta: Meta<typeof LabelsField> = {
  component: LabelsField,
  args: {
    label: "ラベル",
    onChange: fn(),
    disabled: false,
    "data-testid": "story-labels-field",
  },
};

export default meta;

type Story = StoryObj<typeof LabelsField>;

const SUGGESTIONS = [
  LabelDefinition.fromWire({ name: "bug", color: "#e11d48" }),
  LabelDefinition.fromWire({ name: "feature", color: "#16a34a" }),
  LabelDefinition.fromWire({ name: "docs" }),
];

export const WithSelection: Story = {
  args: {
    value: ["bug"],
    suggestions: SUGGESTIONS,
  },
};

export const Empty: Story = {
  args: {
    value: [],
    suggestions: SUGGESTIONS,
  },
};

export const NoSuggestions: Story = {
  args: {
    value: [],
    suggestions: [],
  },
};
