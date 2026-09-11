import type { ComponentType, PropsWithChildren } from "react";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { TaskProjection } from "@/domains/task-projection";
import { initialColumns } from "@/test-fixtures";
import { DetailProvider, type DetailProviderProps } from "./index";

/** wrapper に渡せる Partial の props（children は内部で当てる） */
type DetailWrapperArgs = Partial<Omit<DetailProviderProps, "children">>;

/**
 * Wrapper のデフォルト。`allTasks` / `onAddSubIssue` / `onAddLink` は意図的に含めない
 * （未指定だと SubIssue / Links セクションが描画されない、という本番と同じ条件で mount する）。
 */
const DEFAULTS: Omit<DetailProviderProps, "children"> = {
  task: makeTask({ id: "task-1", filePath: "tasks/test.md" }),
  columns: initialColumns,
  projections: TaskProjection.emptyMap,
  onTaskUpdate: () => {},
};

/**
 * `root.render(<Wrapper>…</Wrapper>)` 向けに `ComponentType<PropsWithChildren>` を返す helper。
 * 渡されなかった prop はテスト用のデフォルト値で埋まる。
 * @param args 上書きしたい props（任意）
 * @returns wrapper 用のコンポーネント
 */
export const createDetailWrapper = (
  args: DetailWrapperArgs = {},
): ComponentType<PropsWithChildren> => {
  /**
   * DetailProvider を mount する内部ラッパ。
   * @param props - {@link PropsWithChildren}
   * @returns Provider 要素
   */
  const Wrapper = ({ children }: PropsWithChildren) => (
    <DetailProvider {...DEFAULTS} {...args}>
      {children}
    </DetailProvider>
  );
  Wrapper.displayName = "DetailWrapper";
  return Wrapper;
};
