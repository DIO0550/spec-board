import type { StatusColumn } from "../types";

type StatusColumnTableProps = {
  columns: readonly StatusColumn[];
  doneColumn: string;
  onNameChange: (id: string, name: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDoneChange: (name: string) => void;
  onDelete: (id: string) => void;
};

/**
 * ステータスカラムの順序・名称・完了指定を編集する表。
 * @param props - カラム表の値とpresentational callbacks
 * @returns カラム定義表
 */
export const StatusColumnTable = ({
  columns,
  doneColumn,
  onNameChange,
  onMove,
  onDoneChange,
  onDelete,
}: StatusColumnTableProps) => (
  <div className="overflow-hidden rounded-lg border border-border bg-surface">
    <div className="border-b border-border bg-surface-muted px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted">
      カラム定義{" "}
      <span className="ml-2 font-normal normal-case tracking-normal text-text-dim">
        ドラッグ、または ↑ ↓ で並び替え
      </span>
    </div>
    <div className="grid grid-cols-[26px_30px_minmax(160px,1fr)_96px_132px_84px] items-center gap-3 border-b border-border bg-surface-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">
      <span /> <span>順</span> <span>カラム名</span> <span>タスク</span>
      <span>完了カラム</span> <span className="sr-only">操作</span>
    </div>
    {columns.map((column, index) => (
      <div
        key={column.id}
        className="grid grid-cols-[26px_30px_minmax(160px,1fr)_96px_132px_84px] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-surface-muted"
      >
        <span
          aria-hidden="true"
          className="cursor-grab text-center text-text-dim"
        >
          ⠿
        </span>
        <span className="font-mono text-[11px] text-text-dim">{index}</span>
        <label className="flex min-w-0 items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: column.color }}
          />
          <span className="sr-only">{column.name} の名前</span>
          <input
            value={column.name}
            onChange={(event) => onNameChange(column.id, event.target.value)}
            className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 text-[12.5px] font-medium hover:border-border focus:border-accent focus:bg-surface focus:outline-none"
          />
        </label>
        <span
          className={
            column.taskCount === 0
              ? "font-mono text-xs text-text-dim"
              : "font-mono text-xs text-accent"
          }
        >
          {column.taskCount} 件
        </span>
        <label className="flex items-center gap-2 text-[11.5px] text-muted">
          <input
            type="radio"
            name="done-column"
            checked={doneColumn === column.name}
            aria-label={`${column.name} を完了カラムにする`}
            onChange={() => onDoneChange(column.name)}
          />
          {doneColumn === column.name ? "完了として扱う" : "—"}
        </label>
        <div className="flex justify-end gap-0.5">
          <button
            type="button"
            aria-label={`${column.name} を上へ`}
            disabled={index === 0}
            onClick={() => onMove(column.id, -1)}
            className="size-6 rounded text-muted hover:bg-background disabled:opacity-25"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`${column.name} を下へ`}
            disabled={index === columns.length - 1}
            onClick={() => onMove(column.id, 1)}
            className="size-6 rounded text-muted hover:bg-background disabled:opacity-25"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`${column.name} を削除`}
            title={
              column.taskCount > 0
                ? "タスクが残っているため削除できません"
                : "削除"
            }
            disabled={column.taskCount > 0 || columns.length <= 1}
            onClick={() => onDelete(column.id)}
            className="size-6 rounded text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-25"
          >
            ×
          </button>
        </div>
      </div>
    ))}
  </div>
);
