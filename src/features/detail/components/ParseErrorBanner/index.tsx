import { hasParseError } from "@/domains/parse-error";
import type { Task } from "@/types/task";

/** ParseErrorBanner の Props */
export type ParseErrorBannerProps = {
  /** 表示対象タスク */
  task: Task;
};

/**
 * DetailScreen ヘッダー内に表示するパースエラーバナー（赤系）。
 * `task.warnings` に invalid 系コードを含むときのみ描画し、md の手動修正を促す。
 * dismiss 不可で `role="alert"` を持つ。判定は `domains/parse-error` に委譲する。
 *
 * @param props - {@link ParseErrorBannerProps}
 * @returns パースエラーバナー要素、または `null`
 */
export const ParseErrorBanner = (props: ParseErrorBannerProps) => {
  const { task } = props;
  if (!hasParseError(task)) {
    return null;
  }
  return (
    <div
      role="alert"
      data-testid="parse-error-banner"
      className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
    >
      <span aria-hidden="true">⚠</span>
      <span>
        フロントマターに不正な値があります。md ファイルを手動修正してください。
      </span>
    </div>
  );
};
