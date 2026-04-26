import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Task } from "@/types/task";

type ParentTaskSelectProps = {
  /** 選択候補となるタスク一覧 */
  tasks: Task[];
  /** 現在選択中の親タスクのファイルパス（未選択時は undefined） */
  value: string | undefined;
  /**
   * 選択変更時のコールバック
   * @param filePath - 選択されたタスクのファイルパス（解除時は undefined）
   */
  onChange: (filePath: string | undefined) => void;
  /** 無効化（送信中など） */
  disabled?: boolean;
};

/**
 * 既存タスクから親タスクを検索・選択するコンポーネント。
 * 検索入力でタイトルまたはファイルパスを部分一致フィルタし、候補をクリックで選択する。
 *
 * @param props - {@link ParentTaskSelectProps}
 * @returns 親タスク選択UI
 */
export const ParentTaskSelect = ({
  tasks,
  value,
  onChange,
  disabled = false,
}: ParentTaskSelectProps) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const id = useId();
  const inputId = `${id}-parent-input`;
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const selected = useMemo(
    () => tasks.find((t) => t.filePath === value),
    [tasks, value],
  );

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return tasks;
    }
    return tasks.filter((t) => {
      const title = (t.title || t.filePath).toLowerCase();
      return title.includes(q) || t.filePath.toLowerCase().includes(q);
    });
  }, [tasks, query]);

  const handleSelect = (task: Task) => {
    onChange(task.filePath);
    setQuery("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(undefined);
    setQuery("");
  };

  return (
    <div data-testid="parent-task-select">
      <div className="mb-1 block text-xs font-medium text-gray-700">
        {selected ? "親タスク" : <label htmlFor={inputId}>親タスク</label>}
      </div>
      {selected ? (
        <div className="flex items-center gap-2 rounded border border-gray-300 bg-gray-50 px-2 py-1 text-sm">
          <span
            className="min-w-0 flex-1 truncate text-gray-800"
            data-testid="parent-task-selected"
          >
            {selected.title || selected.filePath}
          </span>
          <button
            type="button"
            aria-label="親タスクを解除"
            className="rounded text-gray-400 hover:text-gray-700 disabled:opacity-50"
            disabled={disabled}
            onClick={handleClear}
            data-testid="parent-task-clear"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              // クリック選択を許容するため少し遅延。アンマウント時に解除する。
              if (blurTimeoutRef.current !== null) {
                window.clearTimeout(blurTimeoutRef.current);
              }
              blurTimeoutRef.current = window.setTimeout(() => {
                blurTimeoutRef.current = null;
                setIsOpen(false);
              }, 100);
            }}
            disabled={disabled}
            placeholder="タスクを検索して選択"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm outline-none focus:border-blue-500 disabled:bg-gray-100"
            data-testid="parent-task-input"
          />
          {isOpen && candidates.length > 0 && (
            <div
              className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
              data-testid="parent-task-list"
            >
              {candidates.map((task) => {
                const isSelected = task.filePath === value;
                return (
                  <button
                    key={task.id}
                    type="button"
                    aria-pressed={isSelected}
                    className="block w-full truncate px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(task);
                    }}
                    data-testid={`parent-task-option-${task.id}`}
                  >
                    {task.title || task.filePath}
                  </button>
                );
              })}
            </div>
          )}
          {isOpen && candidates.length === 0 && (
            <p
              className="absolute left-0 right-0 z-10 mt-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 shadow-lg"
              data-testid="parent-task-empty"
            >
              該当するタスクがありません
            </p>
          )}
        </div>
      )}
    </div>
  );
};
