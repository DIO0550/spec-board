import type { Task } from "@/types/task";

/** CycleWarningBanner の Props */
export type CycleWarningBannerProps = {
  /** 表示対象タスク */
  task: Task;
};

/**
 * DetailPanel ヘッダー直下に表示する循環警告バナー。
 * `task.warnings` に `parentCycle` を含むときのみ描画し、ユーザーに
 * 親タスクの循環を通知する。dismiss 不可で `role="alert"` を持つ。
 *
 * @param props - {@link CycleWarningBannerProps}
 * @returns 循環警告バナー要素、または `null`
 */
export const CycleWarningBanner = (props: CycleWarningBannerProps) => {
  const { task } = props;
  const hasCycle = task.warnings.some((w) => w.code === "parentCycle");
  if (!hasCycle) {
    return null;
  }
  return (
    <div
      role="alert"
      data-testid="cycle-warning-banner"
      className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
    >
      <span aria-hidden="true">⚠</span>
      <span>
        親タスクが循環しています。<code>parent:</code> を見直してください。
      </span>
    </div>
  );
};
