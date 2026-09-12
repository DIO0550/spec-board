import type { ComponentType, PropsWithChildren } from "react";
import { makeTask } from "@/domains/__tests__/taskFixtures";
import { DeleteFlowProvider, type DeleteFlowProviderProps } from "./index";

/** wrapper に渡せる Partial の props（children は内部で当てる） */
type DeleteFlowWrapperArgs = Partial<Omit<DeleteFlowProviderProps, "children">>;

/** 既定の onDelete（何もしない）。 */
const noopDelete = () => {};

/** Wrapper のデフォルト（既定 task は子なし。`makeTask` は既存の共有 fixture） */
const DEFAULTS: Omit<DeleteFlowProviderProps, "children"> = {
  task: makeTask({ id: "task-1", filePath: "tasks/test.md" }),
  onDelete: noopDelete,
};

/**
 * `root.render(<Wrapper>…</Wrapper>)` 向けに `ComponentType<PropsWithChildren>` を返す helper。
 * @param args 上書きしたい props（任意）
 * @returns wrapper 用のコンポーネント
 */
export const createDeleteFlowWrapper = (
  args: DeleteFlowWrapperArgs = {},
): ComponentType<PropsWithChildren> => {
  /**
   * DeleteFlowProvider を mount する内部ラッパ。
   * @param props - {@link PropsWithChildren}
   * @returns Provider 要素
   */
  const Wrapper = ({ children }: PropsWithChildren) => (
    <DeleteFlowProvider {...DEFAULTS} {...args}>
      {children}
    </DeleteFlowProvider>
  );
  Wrapper.displayName = "DeleteFlowWrapper";
  return Wrapper;
};
