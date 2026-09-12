import type { Decorator } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { TaskProjection } from "@/domains/task-projection";
import {
  detailColumns,
  detailTask,
} from "@/features/detail/components/storybook/fixtures";
import { DetailProvider, type DetailProviderProps } from "../index";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type DetailDecoratorArgs = Partial<Omit<DetailProviderProps, "children">>;

/**
 * `DetailProvider` で Story をラップする Decorator を返す。
 * 渡されなかった prop は fixtures / no-op で埋まる。
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withDetailProvider =
  (args: DetailDecoratorArgs = {}): Decorator =>
  (Story) => (
    <DetailProvider
      task={detailTask}
      columns={detailColumns}
      projections={TaskProjection.emptyMap}
      onTaskUpdate={fn()}
      {...args}
    >
      <Story />
    </DetailProvider>
  );
