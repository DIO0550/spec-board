import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/types/task";
import {
  createTaskSearchIndex,
  searchTaskIndex,
  type TaskSearchMatchField,
} from "../../lib/searchTasks";

type CommandActionId = "new-task" | "settings" | "milestones" | "guide";
type PaletteEntry =
  | {
      kind: "task";
      task: Task;
      /** 一致フィールド（空クエリの全件表示では undefined） */
      matchField?: TaskSearchMatchField;
      /** 本文一致時の一致箇所抜粋 */
      excerpt?: string;
    }
  | { kind: "action"; id: CommandActionId; label: string; hint: string };

/** 一致フィールドの表示ラベル（タイトル一致は自明のためバッジを出さない）。 */
const MATCH_FIELD_LABEL: Partial<Record<TaskSearchMatchField, string>> = {
  id: "ID",
  label: "ラベル",
  filePath: "パス",
  body: "本文",
};

export type CommandPaletteProps = {
  tasks: readonly Task[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskSelect: (taskId: string) => void;
  onNewTask: () => void;
  onSettings: () => void;
  onMilestones: () => void;
  onGuide: () => void;
};

const ACTIONS: readonly Extract<PaletteEntry, { kind: "action" }>[] = [
  { kind: "action", id: "new-task", label: "新規タスク", hint: "作成" },
  { kind: "action", id: "settings", label: "設定", hint: "プロジェクト設定" },
  { kind: "action", id: "milestones", label: "マイルストーン", hint: "一覧" },
  { kind: "action", id: "guide", label: "GUIDE.md", hint: "ファイルを開く" },
];
const MAX_VISIBLE_ENTRIES = 50;

/** グローバル検索と主要画面actionを提供するcommand palette。 */
export const CommandPalette = ({
  tasks,
  isOpen,
  onOpenChange,
  onTaskSelect,
  onNewTask,
  onSettings,
  onMilestones,
  onGuide,
}: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskSearchIndex = useMemo(() => createTaskSearchIndex(tasks), [tasks]);
  const entries = useMemo<PaletteEntry[]>(() => {
    if (!isOpen) {
      return [];
    }
    const normalized = query.trim().toLocaleLowerCase();
    const actions = ACTIONS.filter((action) =>
      action.label.toLocaleLowerCase().includes(normalized),
    );
    const taskEntries = searchTaskIndex(taskSearchIndex, query).map(
      (match): PaletteEntry => ({
        kind: "task",
        task: match.task,
        matchField: match.field,
        excerpt: match.excerpt,
      }),
    );
    return [...actions, ...taskEntries];
  }, [isOpen, query, taskSearchIndex]);
  const visibleEntries = useMemo(
    () => entries.slice(0, MAX_VISIBLE_ENTRIES),
    [entries],
  );
  const activeIndex = Math.min(
    selectedIndex,
    Math.max(visibleEntries.length - 1, 0),
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(true);
        return;
      }
      if (event.key === "Escape" && isOpen) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }
    inputRef.current?.focus();
  }, [isOpen]);

  const selectEntry = (entry: PaletteEntry | undefined): void => {
    if (entry === undefined) {
      return;
    }
    if (entry.kind === "task") {
      onTaskSelect(entry.task.id);
    } else {
      const handlers: Record<CommandActionId, () => void> = {
        "new-task": onNewTask,
        settings: onSettings,
        milestones: onMilestones,
        guide: onGuide,
      };
      handlers[entry.id]();
    }
    onOpenChange(false);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="グローバル検索"
        className="w-full max-w-[640px] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <span aria-hidden="true" className="text-muted">
            ⌕
          </span>
          <input
            ref={inputRef}
            role="combobox"
            aria-controls="command-palette-results"
            aria-expanded="true"
            aria-activedescendant={
              visibleEntries[activeIndex]
                ? `command-entry-${activeIndex}`
                : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) =>
                  Math.min(current + 1, Math.max(visibleEntries.length - 1, 0)),
                );
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                selectEntry(visibleEntries[activeIndex]);
              }
              if (event.key === "Escape") {
                event.stopPropagation();
                onOpenChange(false);
              }
            }}
            placeholder="タスク・本文、コマンドを検索…"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-muted">
            Esc
          </kbd>
        </div>
        <div
          id="command-palette-results"
          role="listbox"
          className="max-h-[420px] overflow-y-auto p-2"
        >
          {visibleEntries.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted">
              一致する項目がありません
            </p>
          ) : (
            visibleEntries.map((entry, index) => {
              const label =
                entry.kind === "task"
                  ? entry.task.title || entry.task.filePath
                  : entry.label;
              const hint =
                entry.kind === "task" ? entry.task.filePath : entry.hint;
              const matchBadge =
                entry.kind === "task" && entry.matchField !== undefined
                  ? MATCH_FIELD_LABEL[entry.matchField]
                  : undefined;
              const excerpt = entry.kind === "task" ? entry.excerpt : undefined;
              return (
                <button
                  id={`command-entry-${index}`}
                  key={
                    entry.kind === "task" ? `task-${entry.task.id}` : entry.id
                  }
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => selectEntry(entry)}
                  className="flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left text-sm aria-selected:bg-accent/10 aria-selected:text-accent"
                >
                  <span className="flex w-full items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {matchBadge !== undefined && (
                      <span
                        className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] leading-none text-muted"
                        data-testid="command-entry-match-field"
                      >
                        {matchBadge}
                      </span>
                    )}
                    <span className="max-w-[46%] truncate font-mono text-[10.5px] text-muted">
                      {hint}
                    </span>
                  </span>
                  {excerpt !== undefined && (
                    <span
                      className="w-full truncate text-[11px] text-muted"
                      data-testid="command-entry-excerpt"
                    >
                      {excerpt}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        {entries.length > visibleEntries.length ? (
          <p className="border-t border-border px-4 py-2 text-xs text-muted">
            {entries.length.toLocaleString("ja-JP")}件中
            {visibleEntries.length.toLocaleString("ja-JP")}件を表示
            <span className="ml-2">検索語を追加して絞り込んでください</span>
          </p>
        ) : null}
        <footer className="flex gap-4 border-t border-border bg-surface-muted px-4 py-2 text-[10.5px] text-muted">
          <span>↑↓ 選択</span>
          <span>↵ 開く</span>
          <span>Esc 閉じる</span>
        </footer>
      </section>
    </div>
  );
};
