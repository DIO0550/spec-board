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
  /** 保存先ファイル名（pv-foot 表示用）。 */
  fileName: string;
  /** プレビュー折りたたみ要求（pv-collapse ボタン）。 */
  onCollapse: () => void;
};

/** プレビューの表示モード。 */
type PreviewMode = "raw" | "rendered";

const TAB_BASE_CLASS_NAME =
  "rounded-md px-3 py-1 text-xs font-medium text-muted aria-pressed:bg-panel aria-pressed:text-foreground aria-pressed:shadow-sm";

/**
 * frontmatter＋本文を結合した最終 markdown を Raw / Rendered でトグル表示する
 * プレビューペイン。再計算は `useMemo` で値変化時のみに抑える。
 * Rendered 時は frontmatter を `<pre>` で上部に出し、本文のみ `MarkdownContent` で描画する。
 * pv-meta に最終 markdown の UTF-8 バイト長、pv-foot に保存先ファイル名を表示する。
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
  // 最終 markdown の UTF-8 バイト長。finalMarkdown と同じ依存で計算し effect を増やさない。
  const byteLength = useMemo(
    () => new TextEncoder().encode(finalMarkdown).length,
    [finalMarkdown],
  );

  return (
    <aside
      aria-label="プレビュー"
      className="flex flex-col overflow-y-auto border-l border-border bg-panel-2 px-5 pt-5 pb-14"
    >
      <div className="mb-3.5 flex items-center gap-2">
        {/* 表示切替のみで tabpanel 関連付けを持たないため、tabs ロールではなく */}
        {/* aria-pressed の単純トグルボタンとして公開する。 */}
        <div className="inline-flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
          <button
            type="button"
            className={TAB_BASE_CLASS_NAME}
            aria-pressed={mode === "rendered"}
            onClick={() => setMode("rendered")}
          >
            レンダリング
          </button>
          <button
            type="button"
            className={TAB_BASE_CLASS_NAME}
            aria-pressed={mode === "raw"}
            onClick={() => setMode("raw")}
          >
            Raw
          </button>
        </div>
        <span
          className="ml-auto font-mono text-xs text-text-dim"
          data-testid="preview-meta"
        >
          Markdown · {byteLength}B
        </span>
        <button
          type="button"
          aria-label="プレビューを閉じる"
          title="プレビューを閉じる"
          onClick={props.onCollapse}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel-2 text-muted hover:border-border-strong hover:bg-bg"
          data-testid="preview-collapse"
        >
          ✕
        </button>
      </div>
      {mode === "raw" ? (
        <pre
          data-testid="preview-raw"
          className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-foreground p-4 font-mono text-xs leading-relaxed text-surface"
        >
          {finalMarkdown}
        </pre>
      ) : (
        <div
          data-testid="preview-rendered"
          className="overflow-hidden rounded-lg border border-border bg-panel"
        >
          <pre className="overflow-x-auto whitespace-pre-wrap border-b border-border bg-surface-muted p-3.5 font-mono text-xs leading-relaxed text-muted">
            {frontmatter}
          </pre>
          <div className="p-4">
            <MarkdownContent body={props.values.body} />
          </div>
        </div>
      )}
      <div
        className="mt-3.5 flex items-center gap-2 rounded-lg border border-border bg-panel px-3 py-2.5 text-xs text-muted"
        data-testid="preview-foot"
      >
        作成すると{" "}
        <code className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-xs">
          {props.fileName}
        </code>{" "}
        が新規作成されます。
      </div>
    </aside>
  );
};
