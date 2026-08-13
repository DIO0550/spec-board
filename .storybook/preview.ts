import { createElement, Fragment, type ReactNode, useEffect } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
import "../src/index.css";

type AppearanceRootProps = {
  children: ReactNode;
  theme: string;
  density: string;
  accent: string;
  stopAnimation: boolean;
};

/**
 * Story globalsをアプリと同じroot data属性へ反映する。
 * @param props - {@link AppearanceRootProps}
 * @returns layoutを増やさないappearance境界
 */
const AppearanceRoot = ({
  children,
  theme,
  density,
  accent,
  stopAnimation,
}: AppearanceRootProps) => {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.density = density;
    root.dataset.accent = accent;
  }, [theme, density, accent]);

  const motionStyle = stopAnimation
    ? createElement(
        "style",
        { "data-storybook-visual-motion": true },
        `*, *::before, *::after {
          animation-delay: 0ms !important;
          animation-duration: 1ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-delay: 0ms !important;
          transition-duration: 0ms !important;
        }`,
      )
    : null;
  return createElement(Fragment, null, motionStyle, children);
};

/** fullscreen / centeredのlayoutを保持したままappearance globalsを適用するdecorator。 */
const withAppearance: Decorator = (Story, context) =>
  createElement(
    AppearanceRoot,
    {
      theme: String(context.globals.theme ?? "light"),
      density: String(context.globals.density ?? "comfortable"),
      accent: String(context.globals.accent ?? "blue"),
      stopAnimation:
        context.globals.visualMode === true ||
        context.globals.visualMode === "true" ||
        context.parameters.visual === true,
    },
    createElement(Story),
  );

const preview: Preview = {
  decorators: [withAppearance],
  globalTypes: {
    theme: {
      description: "表示テーマ",
      defaultValue: "light",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
      },
    },
    density: {
      description: "表示密度",
      defaultValue: "comfortable",
      toolbar: {
        icon: "component",
        items: [
          { value: "comfortable", title: "Comfortable" },
          { value: "compact", title: "Compact" },
        ],
      },
    },
    accent: {
      description: "アクセントカラー",
      defaultValue: "blue",
      toolbar: {
        icon: "circlehollow",
        items: ["blue", "violet", "green", "amber", "rose"],
      },
    },
    visualMode: {
      description: "visual regression向けにanimationを停止",
      defaultValue: false,
      toolbar: { icon: "camera", items: [false, true] },
    },
  },
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "app",
      values: [{ name: "app", value: "#ffffff" }],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    viewport: {
      options: {
        desktop1440: {
          name: "Desktop 1440 × 900",
          styles: { width: "1440px", height: "900px" },
        },
        compact924: {
          name: "Compact 924 × 540",
          styles: { width: "924px", height: "540px" },
        },
      },
    },
  },
};

export default preview;
