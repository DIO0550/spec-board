import { useMemo, useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
  buildPreviewFrontmatter,
  combineMarkdown,
  type PreviewFrontmatterInput,
} from "@/features/task-form/lib/buildPreviewFrontmatter";

export type PreviewPaneProps = {
  /** フォーム現在値（プレビュー対象）。frontmatter 用フィールド + 本文。 */
  values: PreviewFrontmatterInput & { body: string };
};

/** プレビューの表示モード。 */
type PreviewMode = "raw" | "rendered";

const TAB_BASE_CLASS_NAME =
  "rounded px-3 py-1 text-sm aria-selected:bg-surface-muted aria-selected:font-semibold";

/**
 * frontmatter＋本文を結合した最終 markdown を Raw / Rendered でトグル表示する
 * プレビューペイン。再計算は `useMemo` で値変化時のみに抑える。
 * Rendered 時は frontmatter を `<pre>` で上部に出し、本文のみ `MarkdownContent` で描画する。
 * @param props - {@link PreviewPaneProps}
 * @returns プレビューペイン要素
 */
export const PreviewPane = (props: PreviewPaneProps) => {
  const [mode, setMode] = useState<PreviewMode>("rendered");

  const frontmatter = useMemo(
    () => buildPreviewFrontmatter(props.values),
    [props.values],
  );
  const finalMarkdown = useMemo(
    () => combineMarkdown(frontmatter, props.values.body),
    [frontmatter, props.values.body],
  );

  return (
    <aside aria-label="プレビュー" className="flex flex-col gap-2">
      <div role="tablist" className="flex gap-1">
        <button
          type="button"
          role="tab"
          className={TAB_BASE_CLASS_NAME}
          aria-selected={mode === "rendered"}
          onClick={() => setMode("rendered")}
        >
          レンダリング
        </button>
        <button
          type="button"
          role="tab"
          className={TAB_BASE_CLASS_NAME}
          aria-selected={mode === "raw"}
          onClick={() => setMode("raw")}
        >
          Raw
        </button>
      </div>
      {mode === "raw" ? (
        <pre
          data-testid="preview-raw"
          className="overflow-x-auto whitespace-pre-wrap font-mono text-sm"
        >
          {finalMarkdown}
        </pre>
      ) : (
        <div data-testid="preview-rendered" className="space-y-4">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-surface-muted p-2 font-mono text-xs text-muted">
            {frontmatter}
          </pre>
          <MarkdownContent body={props.values.body} />
        </div>
      )}
    </aside>
  );
};
