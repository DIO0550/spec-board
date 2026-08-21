import { useMemo, useState } from "react";
import { StatusColumnTable } from "./StatusColumnTable";
import type { StatusColumn, StatusSettingsValue } from "./types";

const DEFAULT_COLUMNS: readonly StatusColumn[] = [
  {
    id: "backlog",
    name: "Backlog",
    taskCount: 3,
    color: "oklch(0.62 0.12 235)",
  },
  { id: "todo", name: "Todo", taskCount: 4, color: "oklch(0.54 0.14 265)" },
  {
    id: "progress",
    name: "In Progress",
    taskCount: 3,
    color: "oklch(0.72 0.15 75)",
  },
  {
    id: "review",
    name: "In Review",
    taskCount: 2,
    color: "oklch(0.60 0.13 295)",
  },
  { id: "done", name: "Done", taskCount: 3, color: "oklch(0.60 0.13 155)" },
];

/**
 * 保存前に WIP 上限を正規化する。1 未満・非整数の値は「制限なし」（undefined）へ倒す
 * （BE の lenient 契約と同じ値域）。
 * 入力中は 0 等の中間値を保持したまま編集できるよう、正規化は保存時にだけ行う。
 * @param column - 正規化対象のカラム
 * @returns wipLimit を正規化したカラム
 */
const normalizeColumnWipLimit = (column: StatusColumn): StatusColumn => {
  if (
    column.wipLimit !== undefined &&
    Number.isInteger(column.wipLimit) &&
    column.wipLimit >= 1
  ) {
    return column;
  }
  const { wipLimit: _dropped, ...rest } = column;
  return rest;
};

type StatusSettingsTabProps = {
  initialColumns?: readonly StatusColumn[];
  initialDoneColumn?: string;
  saveState?: "idle" | "saving" | "saved" | "error";
  onSave?: (
    value: StatusSettingsValue,
    // biome-ignore lint/suspicious/noConfusingVoidType: synchronous callbacks may intentionally return void.
  ) => boolean | void | Promise<boolean | undefined>;
  onOpenBoard?: () => void;
  onOpenConfig?: () => void;
};

/**
 * ボードのステータス/カラム定義を編集する設定タブ。
 * 永続化はonSaveへ委譲し、未接続時も編集状態を視覚確認できる。
 * @param props - 初期値・保存状態・外部action callbacks
 * @returns ステータス設定画面
 */
export const StatusSettingsTab = ({
  initialColumns = DEFAULT_COLUMNS,
  initialDoneColumn = "Done",
  saveState = "idle",
  onSave,
  onOpenBoard,
  onOpenConfig,
}: StatusSettingsTabProps) => {
  const [columns, setColumns] =
    useState<readonly StatusColumn[]>(initialColumns);
  const [doneColumn, setDoneColumn] = useState(initialDoneColumn);
  const [newName, setNewName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [internalSaveState, setInternalSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const currentSaveState = saveState === "idle" ? internalSaveState : saveState;
  const taskCount = useMemo(
    () => columns.reduce((sum, column) => sum + column.taskCount, 0),
    [columns],
  );

  /** @param next - 次のカラム配列 */
  const updateColumns = (next: readonly StatusColumn[]): void => {
    setColumns(next);
    setDirty(true);
  };

  /** @param id - 対象ID @param direction - 移動方向 */
  const move = (id: string, direction: -1 | 1): void => {
    const from = columns.findIndex((column) => column.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= columns.length) {
      return;
    }
    const next = [...columns];
    const moved = next.splice(from, 1)[0];
    if (moved === undefined) {
      return;
    }
    next.splice(to, 0, moved);
    updateColumns(next);
  };

  /** 新しい空カラムを末尾へ追加する。 */
  const add = (): void => {
    const name = newName.trim();
    if (
      name === "" ||
      columns.some((column) => column.name.toLowerCase() === name.toLowerCase())
    ) {
      return;
    }
    updateColumns([
      ...columns,
      {
        id: `column-${columns.length}-${name}`,
        name,
        taskCount: 0,
        color: "oklch(0.62 0.12 195)",
      },
    ]);
    setNewName("");
  };

  const save = async (): Promise<void> => {
    if (onSave === undefined) {
      return;
    }
    setInternalSaveState("saving");
    try {
      const result = await onSave({
        columns: columns.map(normalizeColumnWipLimit),
        doneColumn,
      });
      if (result === false) {
        setInternalSaveState("error");
        return;
      }
      setColumns((current) =>
        current.map((column) => ({ ...column, sourceName: column.name })),
      );
      setDirty(false);
      setInternalSaveState("saved");
    } catch {
      setInternalSaveState("error");
    }
  };

  return (
    <section
      className="mx-auto flex w-full max-w-[1080px] flex-col gap-4"
      aria-labelledby="status-settings-title"
    >
      <header className="flex flex-wrap items-end gap-4">
        <h1
          id="status-settings-title"
          className="m-0 text-[22px] font-semibold"
        >
          ステータス
        </h1>
        <p className="flex gap-4 pb-1 text-xs text-muted">
          <span>
            <strong className="font-mono text-foreground">
              {columns.length}
            </strong>{" "}
            カラム
          </span>
          <span>
            <strong className="font-mono text-foreground">{taskCount}</strong>{" "}
            タスク
          </span>
          <span>
            完了カラム{" "}
            <strong className="font-mono text-foreground">{doneColumn}</strong>
          </span>
        </p>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onOpenBoard}
            className="h-7 rounded-md border border-border bg-surface-muted px-2.5 text-xs font-medium"
          >
            ボードで確認
          </button>
          <button
            type="button"
            disabled={
              !dirty || currentSaveState === "saving" || onSave === undefined
            }
            onClick={save}
            className="h-7 rounded-md border border-accent bg-accent px-2.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            {currentSaveState === "saving" ? "保存中…" : "変更を保存"}
          </button>
        </div>
      </header>
      <p className="m-0 max-w-[68ch] text-[12.5px] text-muted">
        ボードの縦列です。ここでの並び順がボードの表示順になります。名前を変更すると、そのステータスのタスクもまとめて切り替わります。
      </p>
      <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 py-2 text-xs text-muted">
        <strong className="font-mono text-[11.5px] text-foreground">
          .spec-board/config.json
        </strong>
        <span className="text-border-strong">·</span>
        <span>カラムと並び順の保存先</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">
          <span className="size-1.5 rounded-full bg-success" />
          12秒前に同期
        </span>
        <button
          type="button"
          onClick={onOpenConfig}
          className="text-xs font-medium text-accent hover:underline"
        >
          設定ファイルを見る
        </button>
      </div>
      <StatusColumnTable
        columns={columns}
        doneColumn={doneColumn}
        onNameChange={(id, name) => {
          const previous = columns.find((column) => column.id === id)?.name;
          updateColumns(
            columns.map((column) =>
              column.id === id ? { ...column, name } : column,
            ),
          );
          if (previous === doneColumn) {
            setDoneColumn(name);
          }
        }}
        onWipLimitChange={(id, wipLimit) =>
          updateColumns(
            columns.map((column) =>
              column.id === id ? { ...column, wipLimit } : column,
            ),
          )
        }
        onMove={move}
        onDoneChange={(name) => {
          setDoneColumn(name);
          setDirty(true);
        }}
        onDelete={(id) =>
          updateColumns(columns.filter((column) => column.id !== id))
        }
      />
      <div className="flex flex-wrap items-center gap-2 rounded-b-lg border border-t-0 border-border bg-surface px-4 py-3">
        <label htmlFor="new-status-column" className="sr-only">
          新しいカラム名
        </label>
        <input
          id="new-status-column"
          aria-label="新しいカラム名"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              add();
            }
          }}
          placeholder="新しいカラム名（例: Blocked）"
          className="h-7 min-w-64 rounded border border-border bg-surface px-2.5 text-xs"
        />
        <button
          type="button"
          onClick={add}
          className="h-7 rounded-md border border-border px-2.5 text-xs font-medium"
        >
          カラムを追加
        </button>
        <span className="text-[11px] text-text-dim">末尾に追加されます</span>
      </div>
      <p className="m-0 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[11.5px] text-muted">
        タスクが残っているカラムは削除できません。先にタスクを移動してください。
      </p>
      {currentSaveState === "saved" && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-3.5 py-2 text-xs text-background"
        >
          変更を保存しました
        </div>
      )}
      {currentSaveState === "error" && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          保存に失敗しました。変更前の状態へ戻しました。
        </div>
      )}
    </section>
  );
};

export type { StatusColumn, StatusSettingsValue } from "./types";
