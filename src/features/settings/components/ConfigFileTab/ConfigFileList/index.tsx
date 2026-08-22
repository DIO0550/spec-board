import { type KeyboardEvent, useRef } from "react";
import type { ConfigFileDefinition, ConfigFileId } from "../types";

type ConfigFileListProps = {
  files: readonly ConfigFileDefinition[];
  selectedId: ConfigFileId;
  /**
   * 設定ファイルを選択したときのcallback。
   * @param id - 選択された設定ファイルの ID
   */
  onSelect: (id: ConfigFileId) => void;
};

/** @param props - ファイル一覧と選択callback @returns 設定ファイルの選択リスト */
export const ConfigFileList = ({
  files,
  selectedId,
  onSelect,
}: ConfigFileListProps) => {
  const listRef = useRef<HTMLDivElement>(null);

  /** @param event - option上のkeyboard event */
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const currentIndex = files.findIndex((file) => file.id === selectedId);
    const lastIndex = files.length - 1;
    let nextIndex = currentIndex;
    if (event.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, lastIndex);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = lastIndex;
    } else {
      return;
    }
    event.preventDefault();
    const next = files[nextIndex];
    if (next === undefined) {
      return;
    }
    onSelect(next.id);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-config-file-id="${next.id}"]`)
      ?.focus();
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-dim">
        .spec-board/
      </div>
      <div ref={listRef} role="listbox" aria-label="設定ファイル">
        {files.map((file) => (
          <button
            key={file.id}
            type="button"
            role="option"
            data-config-file-id={file.id}
            aria-selected={file.id === selectedId}
            tabIndex={file.id === selectedId ? 0 : -1}
            onClick={() => onSelect(file.id)}
            onKeyDown={handleKeyDown}
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
      </div>
      <p className="m-0 border-t border-border bg-surface-muted px-3 py-2.5 text-[11px] text-text-dim">
        外部エディタで編集した場合、アプリ再起動まで反映されません。
      </p>
    </div>
  );
};
