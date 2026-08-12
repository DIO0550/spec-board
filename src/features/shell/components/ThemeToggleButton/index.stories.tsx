// @jsdoc-rules-disable

import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import type { ThemeMode } from "@/features/shell";
import { ThemeProvider, useTheme } from "@/features/shell";
import { ThemeToggleButton } from ".";

type ThemeFixtureProps = { theme: ThemeMode };

const ThemeFixture = ({ theme }: ThemeFixtureProps) => {
  const { setTheme } = useTheme();
  useLayoutEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);
  return <ThemeToggleButton />;
};

const meta: Meta<typeof ThemeToggleButton> = {
  component: ThemeToggleButton,
  argTypes: {},
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ThemeToggleButton>;

export const Default: Story = {
  render: () => <ThemeFixture theme="light" />,
};
export const AllProps: Story = {
  render: () => <ThemeFixture theme="system" />,
};
export const EdgeCases: Story = {
  render: () => <ThemeFixture theme="dark" />,
};
