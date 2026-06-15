import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-themes"],
  framework: { name: "@storybook/react-vite", options: {} },
  typescript: { reactDocgen: "react-docgen-typescript" },
  async viteFinal(baseConfig) {
    return mergeConfig(baseConfig, {
      resolve: {
        // 配列形式で specific を先頭に置き、`@` 一般 alias より確実に優先させる。
        // Storybook には Tauri backend が無いため、ラベル取得フックをサンプル返却の
        // モックへ差し替える（候補が見えるようにする）。
        alias: [
          {
            find: /^@\/hooks\/useLabelList$/,
            replacement: fileURLToPath(
              new URL("./mocks/useLabelList.ts", import.meta.url),
            ),
          },
          {
            find: /^@\//,
            replacement: `${fileURLToPath(new URL("../src", import.meta.url))}/`,
          },
        ],
      },
    });
  },
};

export default config;
