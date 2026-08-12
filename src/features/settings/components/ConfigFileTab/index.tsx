import { useState } from "react";
import { CodeViewer } from "./CodeViewer";
import { ConfigFileList } from "./ConfigFileList";
import type { ConfigFileDefinition, ConfigFileId } from "./types";

const CONFIG_CONTENT = `{
  "version": 1,
  "columns": [
    { "name": "Backlog", "order": 0 },
    { "name": "Todo", "order": 1 },
    { "name": "In Progress", "order": 2 },
    { "name": "In Review", "order": 3 },
    { "name": "Done", "order": 4 }
  ],
  "doneColumn": "Done"
}`;
const GUIDE_CONTENT = `<!-- このファイルは spec-board が自動生成します。 -->

# spec-board タスクフォーマットガイド

## 有効なステータス値

- Backlog
- Todo
- In Progress
- In Review
- Done`;
const DEFAULT_FILES: readonly ConfigFileDefinition[] = [
  {
    id: "config",
    name: "config.json",
    path: ".spec-board/config.json",
    badge: "1.4 KB",
    language: "JSON",
    content: CONFIG_CONTENT,
    generated: false,
  },
  {
    id: "guide",
    name: "GUIDE.md",
    path: ".spec-board/GUIDE.md",
    badge: "自動生成",
    language: "Markdown",
    content: GUIDE_CONTENT,
    generated: true,
  },
];

export type ConfigFileTabProps = {
  files?: readonly ConfigFileDefinition[];
  initialFile?: ConfigFileId;
  status?: "loading" | "ready" | "error";
  error?: string;
  isRegenerating?: boolean;
  toast?: string;
  onCopy?: (id: ConfigFileId) => void;
  onRegenerate?: () => void;
  onOpenExternal?: (id: ConfigFileId) => void;
  onRevealFolder?: () => void;
};

/** @param props - ファイル内容とpresentational callbacks @returns 読み取り専用設定ファイル画面 */
export const ConfigFileTab = ({
  files = DEFAULT_FILES,
  initialFile = "config",
  status = "ready",
  error,
  isRegenerating = false,
  toast,
  onCopy,
  onRegenerate,
  onOpenExternal,
  onRevealFolder,
}: ConfigFileTabProps) => {
  const [selectedId, setSelectedId] = useState<ConfigFileId>(initialFile);
  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-muted">
        設定ファイルを読み込んでいます…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p
        role="alert"
        className="rounded-md border border-danger bg-danger-soft p-4 text-sm text-danger"
      >
        設定ファイルを読み込めませんでした: {error ?? "不明なエラー"}
      </p>
    );
  }
  const selected = files.find((file) => file.id === selectedId) ?? files[0];
  if (selected === undefined) {
    return <p className="text-sm text-muted">設定ファイルがありません</p>;
  }
  return (
    <section
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-4"
      aria-labelledby="config-file-title"
    >
      <header className="flex flex-wrap items-end gap-4">
        <h1 id="config-file-title" className="m-0 text-[22px] font-semibold">
          設定ファイル
        </h1>
        <p className="flex gap-4 pb-1 text-xs text-muted">
          <span>
            <strong className="font-mono text-foreground">
              {files.length}
            </strong>{" "}
            ファイル
          </span>
          <span>
            schema <strong className="font-mono text-foreground">v1</strong>
          </span>
          <span>
            最終更新{" "}
            <strong className="font-mono text-foreground">12秒前</strong>
          </span>
        </p>
        <button
          type="button"
          onClick={onRevealFolder}
          className="ml-auto h-7 rounded-md border border-border px-2.5 text-xs font-medium"
        >
          フォルダを開く
        </button>
      </header>
      <p className="m-0 max-w-[78ch] text-[12.5px] text-muted">
        プロジェクト直下の{" "}
        <code className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[11.5px] text-foreground">
          .spec-board/
        </code>{" "}
        に置かれる実ファイルです。ここは読み取り専用ビューです。
      </p>
      <div className="grid grid-cols-[230px_minmax(0,1fr)] items-start gap-4 max-[880px]:grid-cols-1">
        <ConfigFileList
          files={files}
          selectedId={selected.id}
          onSelect={setSelectedId}
        />
        <CodeViewer
          file={selected}
          onCopy={() => onCopy?.(selected.id)}
          onRegenerate={onRegenerate}
          onOpenExternal={() => onOpenExternal?.(selected.id)}
          isRegenerating={isRegenerating}
        />
      </div>
      {toast !== undefined && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3.5 py-2 text-xs text-background"
        >
          {toast}
        </div>
      )}
      {error !== undefined && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}
    </section>
  );
};

export type { ConfigFileDefinition, ConfigFileId } from "./types";
