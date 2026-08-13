import { useMemo, useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { PreviewMarkdownState } from "@/features/task-form/hooks/usePreviewTaskMarkdown";
import { splitPreviewMarkdown } from "./splitPreviewMarkdown";

export type PreviewPaneProps = {
  /** BE の shared document codec が生成した preview 状態。 */
  state: PreviewMarkdownState;
  /** 保存先ファイル名（pv-foot 表示用）。 */
  fileName: string;
  /** プレビュー折りたたみ要求（pv-collapse ボタン）。 */
  onCollapse: () => void;
};

/** プレビューの表示モード。 */
type PreviewMode = "raw" | "rendered";

const TAB_BASE_CLASS_NAME =
  "rounded-md px-3 py-1 text-xs font-medium text-muted aria-pressed:bg-panel aria-pressed:text-foreground aria-pressed:shadow-sm";

type FrontmatterPreviewProps = {
  /** `---` を含む frontmatter 原文。 */
  value: string;
};

/**
 * frontmatter原文を保持したまま、YAMLのkey/valueに表示色を付ける。
 * @param props - {@link FrontmatterPreviewProps}
 * @returns 構文色付きfrontmatter
 */
const FrontmatterPreview = ({ value }: FrontmatterPreviewProps) => {
  const occurrenceByLine = new Map<string, number>();
  const lines = value.split("\n").map((line) => {
    const occurrence = (occurrenceByLine.get(line) ?? 0) + 1;
    occurrenceByLine.set(line, occurrence);
    return { key: `${line}\u0000${occurrence}`, line };
  });
  return (
    <>
      {lines.map(({ key, line }, index) => {
        const match = /^([^\s:#][^:]*):(.*)$/.exec(line);
        const lineBreak = index < lines.length - 1 ? "\n" : "";
        if (match === null) {
          return (
            <span key={key} className="text-text-dim">
              {line}
              {lineBreak}
            </span>
          );
        }
        return (
          <span key={key}>
            <span data-preview-frontmatter-key className="text-indigo-700">
              {match[1]}
            </span>
            <span className="text-text-dim">:</span>
            <span data-preview-frontmatter-value className="text-emerald-700">
              {match[2]}
            </span>
            {lineBreak}
          </span>
        );
      })}
    </>
  );
};

/**
 * BE が生成した full markdown を Raw / Rendered でトグル表示するプレビューペイン。
 * Rendered 時は fence の内側を `<pre>` で上部に出し、本文のみ `MarkdownContent` で描画する。
 * pending / error 中は古い markdown を表示せず、pv-meta は 0B とする。
 * @param props - {@link PreviewPaneProps}
 * @returns プレビューペイン要素
 */
export const PreviewPane = (props: PreviewPaneProps) => {
  const [mode, setMode] = useState<PreviewMode>("rendered");

  const markdown = props.state.kind === "ready" ? props.state.markdown : "";
  const split = useMemo(
    () =>
      props.state.kind === "ready" ? splitPreviewMarkdown(markdown) : null,
    [markdown, props.state.kind],
  );
  const byteLength = useMemo(() => {
    if (props.state.kind !== "ready" || split === null) {
      return 0;
    }
    return new TextEncoder().encode(markdown).length;
  }, [markdown, props.state.kind, split]);
  const hasError = props.state.kind === "error" || split === null;
  const errorMessage =
    props.state.kind === "error"
      ? props.state.error.message
      : "プレビューを生成できませんでした";

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
      {props.state.kind === "pending" ? (
        <div
          data-testid="preview-pending"
          className="rounded-lg border border-border bg-panel p-4 text-sm text-muted"
        >
          プレビューを生成しています…
        </div>
      ) : hasError ? (
        <div
          data-testid="preview-error"
          className="rounded-lg border border-danger/40 bg-panel p-4 text-sm text-danger"
        >
          {errorMessage}
        </div>
      ) : mode === "raw" ? (
        <pre
          data-testid="preview-raw"
          className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-foreground p-4 font-mono text-xs leading-relaxed text-surface"
        >
          {markdown}
        </pre>
      ) : (
        <div
          data-testid="preview-rendered"
          className="overflow-hidden rounded-lg border border-border bg-panel"
        >
          <pre className="overflow-x-auto whitespace-pre-wrap border-b border-border bg-surface-muted p-3.5 font-mono text-xs leading-relaxed text-muted">
            <FrontmatterPreview value={split.frontmatter} />
          </pre>
          <div className="p-4">
            <MarkdownContent body={split.body} />
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
