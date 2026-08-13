import type { ConfigFileDefinition } from "../types";

type CodeViewerProps = {
  file: ConfigFileDefinition;
  onCopy?: () => void;
  onRegenerate?: () => void;
  onOpenExternal?: () => void;
  isRegenerating?: boolean;
};

/** @param props - 選択ファイルとaction callbacks @returns 行番号付きread-only viewer */
export const CodeViewer = ({
  file,
  onCopy,
  onRegenerate,
  onOpenExternal,
  isRegenerating = false,
}: CodeViewerProps) => {
  const lines = file.content.split("\n");
  const renderedLines = lines.map((line, lineIndex) => ({
    id: `${file.id}-line-${lineIndex + 1}`,
    number: lineIndex + 1,
    text: line,
  }));
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-border bg-surface-muted px-3.5 py-2">
        <strong className="font-mono text-[11.5px]">{file.path}</strong>
        <span className="text-border-strong">·</span>
        <span className="font-mono text-[11px] text-text-dim">
          {file.language} · {lines.length} 行
        </span>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10.5px] text-muted">
          読み取り専用
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onCopy}
            className="h-7 rounded-md border border-border px-2.5 text-xs"
          >
            コピー
          </button>
          {file.generated && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="h-7 rounded-md border border-border px-2.5 text-xs"
            >
              {isRegenerating ? "再生成中…" : "再生成"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenExternal}
            className="h-7 rounded-md border border-border px-2.5 text-xs"
          >
            外部エディタで開く
          </button>
        </div>
      </header>
      <pre className="m-0 max-h-[calc(100vh-320px)] overflow-auto font-mono text-xs leading-7">
        {renderedLines.map((line) => (
          <span
            key={line.id}
            className="grid grid-cols-[46px_minmax(0,1fr)] hover:bg-surface-muted"
          >
            <span
              aria-hidden="true"
              className="select-none border-r border-border bg-surface-muted pr-3 text-right text-[11px] text-text-dim"
            >
              {line.number}
            </span>
            <code className="whitespace-pre px-4 text-foreground">
              {line.text === "" ? " " : line.text}
            </code>
          </span>
        ))}
      </pre>
      <footer className="flex flex-wrap gap-2 border-t border-border bg-surface-muted px-3.5 py-2 text-[11.5px] text-muted">
        {file.generated
          ? "AIエージェント向けの自動生成ガイドです。"
          : "カラム定義とカード並び順の保存先です。"}
        <span className="ml-auto font-mono">UTF-8 · LF</span>
      </footer>
    </article>
  );
};
