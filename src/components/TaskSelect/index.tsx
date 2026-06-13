import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Task } from "@/types/task";

/** TaskSelect の Props */
export type TaskSelectProps = {
  /** 選択候補となるタスク一覧 */
  readonly tasks: readonly Task[];
  /** 候補から除外する filePath 集合（呼び出し側で重複・自身などを除外する用途） */
  readonly excludeFilePaths?: readonly string[];
  /** 現在選択中のタスクのファイルパス（未選択時は null） */
  readonly value: string | null;
  /**
   * 選択変更時のコールバック
   * @param filePath - 選択されたタスクのファイルパス（解除時は null）
   */
  readonly onChange: (filePath: string | null) => void;
  /** Escape / 外側クリックなど popover を閉じたい時の通知 */
  readonly onClose?: () => void;
  /** 検索入力の placeholder */
  readonly placeholder?: string;
  /** ラベル文言（指定時のみラベル領域を描画） */
  readonly label?: string;
  /** 無効化（送信中など） */
  readonly disabled?: boolean;
  /**
   * 変更不可。`value === null` の場合は検索 input を描画せず未設定 placeholder のみ表示し、
   * 値がある場合は × ボタンを描画しない。disabled と直交する。
   */
  readonly readOnly?: boolean;
  /**
   * 全 data-testid に共通する prefix（既定 "task-select"）。
   * 出力規則は `${prefix}-{role}` 固定接尾辞ルール:
   *  - root container: `${prefix}-select`
   *  - selected label: `${prefix}-selected`
   *  - clear button:   `${prefix}-clear`
   *  - readOnly empty: `${prefix}-readonly-empty`
   *  - search input:   `${prefix}-input`
   *  - candidate list: `${prefix}-list`
   *  - option:         `${prefix}-option-${task.id}`
   *  - empty fallback: `${prefix}-empty`
   */
  readonly testIdPrefix?: string;
  /** マウント時に検索 input をフォーカスする（popover 起動用途）。 */
  readonly autoFocus?: boolean;
};

/**
 * タスク一覧から検索 + 部分一致フィルタで選択する汎用コンポーネント。
 * ParentTaskSelect / LinksSection などから wrapper で利用する。
 *
 * @param props - {@link TaskSelectProps}
 * @returns タスク選択 UI
 */
export const TaskSelect = ({
  tasks,
  excludeFilePaths = [],
  value,
  onChange,
  onClose,
  placeholder = "タスクを検索して選択",
  label,
  disabled = false,
  readOnly = false,
  testIdPrefix = "task-select",
  autoFocus = false,
}: TaskSelectProps) => {
  const prefix = testIdPrefix;
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(autoFocus);
  const id = useId();
  const inputId = `${id}-task-select-input`;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (onClose === undefined) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // capture フェーズ（第 3 引数 true）で Escape を親より先に捕捉し、stopPropagation で
    // 親の Escape ハンドラ（詳細画面を閉じる処理など）への伝播を止める。これにより Escape は
    // まず popover だけを閉じ、「Esc で詳細画面ごと閉じてしまう」挙動を防ぐ。
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (onClose === undefined) {
      return;
    }
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current === null) {
        return;
      }
      if (e.target instanceof Node && containerRef.current.contains(e.target)) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [onClose]);

  const selected = useMemo(
    () => tasks.find((t) => t.filePath === value),
    [tasks, value],
  );

  const candidates = useMemo(() => {
    const excluded = new Set(excludeFilePaths);
    const filtered = tasks.filter((t) => !excluded.has(t.filePath));
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      return filtered;
    }
    return filtered.filter((t) => {
      const title = (t.title || t.filePath).toLowerCase();
      return title.includes(q) || t.filePath.toLowerCase().includes(q);
    });
  }, [tasks, excludeFilePaths, query]);

  const handleSelect = (task: Task) => {
    onChange(task.filePath);
    setQuery("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
  };

  const selectedLabel = selected
    ? selected.title || selected.filePath
    : value !== null
      ? value
      : undefined;
  const showSelectedLike = selectedLabel !== undefined;
  const showReadOnlyEmpty = !showSelectedLike && readOnly;

  return (
    <div ref={containerRef} data-testid={`${prefix}-select`}>
      {label !== undefined && (
        <div className="mb-1 block text-xs font-medium text-foreground">
          {showSelectedLike || showReadOnlyEmpty ? (
            label
          ) : (
            <label htmlFor={inputId}>{label}</label>
          )}
        </div>
      )}
      {showSelectedLike ? (
        <div className="flex items-center gap-2 rounded border border-border bg-surface-muted px-2 py-1 text-sm">
          <span
            className="min-w-0 flex-1 truncate text-foreground"
            data-testid={`${prefix}-selected`}
          >
            {selectedLabel}
          </span>
          {!readOnly && (
            <button
              type="button"
              aria-label={label !== undefined ? `${label}を解除` : "選択を解除"}
              className="rounded text-muted hover:text-foreground disabled:opacity-50"
              disabled={disabled}
              onClick={handleClear}
              data-testid={`${prefix}-clear`}
            >
              ×
            </button>
          )}
        </div>
      ) : showReadOnlyEmpty ? (
        <div
          className="rounded border border-border bg-surface-muted px-2 py-1 text-sm text-muted"
          data-testid={`${prefix}-readonly-empty`}
        >
          （未設定）
        </div>
      ) : (
        <div className="relative">
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => {
              // 候補ボタンの mousedown→click は input の blur より後に処理されるため、
              // blur 即時に popover を閉じると候補クリックが選択前に消えてしまう。
              // 閉じる処理を少し遅延させ、候補クリックの確定を待ってから閉じる。
              // 100ms は click 確定に十分かつ、ユーザーに閉じ遅れを感じさせない値。
              if (blurTimeoutRef.current !== null) {
                window.clearTimeout(blurTimeoutRef.current);
              }
              blurTimeoutRef.current = window.setTimeout(() => {
                blurTimeoutRef.current = null;
                setIsOpen(false);
              }, 100);
            }}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full rounded border border-border px-2 py-1 text-sm outline-none focus:border-accent disabled:bg-surface-muted"
            data-testid={`${prefix}-input`}
          />
          {isOpen && candidates.length > 0 && (
            // z-10=候補 popover。通常コンテンツの直上に出すだけの最下層。
            // z 階層全体の取り決めは src/index.css を参照。
            <div
              className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded border border-border bg-surface shadow-lg"
              data-testid={`${prefix}-list`}
            >
              {candidates.map((task) => {
                const isSelected = task.filePath === value;
                return (
                  <button
                    key={task.id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={disabled}
                    className="block w-full truncate px-2 py-1 text-left text-sm text-foreground hover:bg-surface-muted disabled:opacity-50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(task);
                    }}
                    data-testid={`${prefix}-option-${task.id}`}
                  >
                    {task.title || task.filePath}
                  </button>
                );
              })}
            </div>
          )}
          {isOpen && candidates.length === 0 && (
            <p
              className="absolute left-0 right-0 z-10 mt-1 rounded border border-border bg-surface px-2 py-1 text-xs text-muted shadow-lg"
              data-testid={`${prefix}-empty`}
            >
              該当するタスクがありません
            </p>
          )}
        </div>
      )}
    </div>
  );
};
