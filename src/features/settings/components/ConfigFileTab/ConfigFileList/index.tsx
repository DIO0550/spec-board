import type { ConfigFileDefinition, ConfigFileId } from "../types";

type ConfigFileListProps = {
  files: readonly ConfigFileDefinition[];
  selectedId: ConfigFileId;
  onSelect: (id: ConfigFileId) => void;
};

/** @param props - ファイル一覧と選択callback @returns 設定ファイルのタブリスト */
export const ConfigFileList = ({
  files,
  selectedId,
  onSelect,
}: ConfigFileListProps) => (
  <div
    role="tablist"
    aria-label="設定ファイル"
    className="overflow-hidden rounded-lg border border-border bg-surface"
  >
    <div className="border-b border-border bg-surface-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-dim">
      .spec-board/
    </div>
    {files.map((file) => (
      <button
        key={file.id}
        type="button"
        role="tab"
        aria-selected={file.id === selectedId}
        onClick={() => onSelect(file.id)}
        className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-muted aria-selected:bg-accent-soft aria-selected:shadow-[inset_2px_0_0_var(--color-accent)]"
      >
        <span aria-hidden="true" className="font-mono text-accent">
          {file.id === "config" ? "{}" : "M↓"}
        </span>
        <span
          className={`min-w-0 flex-1 truncate font-mono text-xs font-medium ${file.generated ? "text-muted" : "text-foreground"}`}
        >
          {file.name}
        </span>
        <span className="font-mono text-[10px] text-text-dim">
          {file.badge}
        </span>
      </button>
    ))}
    <p className="m-0 border-t border-border bg-surface-muted px-3 py-2.5 text-[11px] text-text-dim">
      外部エディタで編集した場合、アプリ再起動まで反映されません。
    </p>
  </div>
);
