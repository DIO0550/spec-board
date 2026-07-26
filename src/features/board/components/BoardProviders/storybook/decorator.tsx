import type { Decorator } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { TaskProjection } from "@/domains/task-projection";
import { BoardProviders } from "..";

/** decorator に渡せる Partial の props（children は Story が当てる） */
type BoardProvidersDecoratorArgs = Partial<
  Omit<ComponentProps<typeof BoardProviders>, "children">
>;

/**
 * Storybook の decorators 配列向けに `BoardProviders` で Story をラップする。
 * 既存 `withBoardCardProvider` / `withBoardColumnProvider` と同 tier の API で、
 * 未指定の prop は空配列 / no-op で埋まる（required な columns / tasks / allTasks も
 * Story 側で省略可能にすることで、追加 Story でのボイラープレートと渡し忘れを防ぐ）。
 *
 * `allTasks` 省略時は `tasks` を流用する（`BoardProviders.state.test.tsx` の
 * `mountProbe` と同型）。tasks だけ渡して allTasks 空のままだと
 * `BoardCardProvider.byPath` や階層集計が壊れた状態の Story が作れてしまうため。
 *
 * @param args 上書きしたい props（任意）
 * @returns Storybook の Decorator
 */
export const withBoardProviders =
  (args: BoardProvidersDecoratorArgs = {}): Decorator =>
  (Story) => {
    const tasks = args.tasks ?? [];
    const allTasks = args.allTasks ?? tasks;
    return (
      <BoardProviders
        columns={[]}
        projections={TaskProjection.emptyMap}
        {...args}
        tasks={tasks}
        allTasks={allTasks}
      >
        <Story />
      </BoardProviders>
    );
  };
