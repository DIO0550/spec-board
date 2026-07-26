import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import { createDragEvent } from "@/test-fixtures/createDragEvent";
import type { Column as ColumnType } from "@/types/column";
import type { ColumnReorderHandler } from "../../BoardColumnProvider";
import { BoardProviders } from "../../BoardProviders";
import { Board } from "..";
import { COLUMN_DRAG_MIME_TYPE } from "../mime";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

type RenderOptions = {
  /** Board.Column の元になるカラム定義 */
  columns: readonly ColumnType[];
  /** 「+ 追加」クリック時のコールバック（省略時は no-op） */
  onAddTask?: (columnName: string) => void;
  /** カラム並び替え確定時のコールバック */
  onColumnReorder?: ColumnReorderHandler;
};

/**
 * BoardProviders で 1 段ラップしたうえで、フラットな options を Board.Column に
 * 組み替えて Board を mount するローカルヘルパー。
 * 表示用 tasks / allTasks は空配列固定（カラム DnD は task 側を参照しない）。
 * @param options - render に使う props 群
 */
const renderWithProviders = (options: RenderOptions) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const ordered = [...options.columns].sort((a, b) => a.order - b.order);
  const onAddTask = options.onAddTask ?? (() => {});
  act(() => {
    root?.render(
      <BoardProviders
        projections={TaskProjection.emptyMap}
        columns={options.columns}
        tasks={[]}
        allTasks={[]}
        onColumnReorder={options.onColumnReorder}
      >
        <Board>
          {ordered.map((col, index) => (
            <Board.Column
              key={col.name}
              name={col.name}
              color={col.color}
              order={index}
              onAddTask={onAddTask}
            />
          ))}
        </Board>
      </BoardProviders>,
    );
  });
};

const columns3: ColumnType[] = [
  { name: "A", order: 0 },
  { name: "B", order: 1 },
  { name: "C", order: 2 },
];

const columnSections = (): HTMLElement[] =>
  Array.from(
    container?.querySelectorAll<HTMLElement>(
      "section[data-testid^='column-']",
    ) ?? [],
  );

const headers = (): HTMLElement[] =>
  Array.from(
    container?.querySelectorAll<HTMLElement>("[data-testid='column-header']") ??
      [],
  );

test("columns が逆順でも表示順 (order 昇順) で render される", () => {
  const reversed: ColumnType[] = [
    { name: "C", order: 2 },
    { name: "B", order: 1 },
    { name: "A", order: 0 },
  ];
  renderWithProviders({
    columns: reversed,
    onAddTask: vi.fn(),
  });
  expect(columnSections().map((s) => s.getAttribute("aria-label"))).toEqual([
    "A",
    "B",
    "C",
  ]);
});

test("カラムが 2 件以上のとき、ColumnHeader は draggable=true で render される", () => {
  renderWithProviders({
    columns: columns3,
    onAddTask: vi.fn(),
  });
  for (const header of headers()) {
    expect(header.getAttribute("draggable")).toBe("true");
  }
});

test("カラムが 1 件のとき、ColumnHeader は draggable=false で render される", () => {
  renderWithProviders({
    columns: [{ name: "Only", order: 0 }],
    onAddTask: vi.fn(),
  });
  const header = headers()[0];
  expect(header?.getAttribute("draggable")).toBe("false");
});

test("カラムヘッダーで dragstart → 別カラムで drop すると onColumnReorder({fromColumnName, toColumnName})", () => {
  const onColumnReorder = vi.fn();
  renderWithProviders({
    columns: columns3,
    onAddTask: vi.fn(),
    onColumnReorder,
  });
  const [headerA, , headerC] = headers();
  const startEvent = createDragEvent("dragstart");
  act(() => {
    headerA.dispatchEvent(startEvent);
  });
  // dragstart should have populated dataTransfer with column MIME
  expect(startEvent.dataTransfer.getData(COLUMN_DRAG_MIME_TYPE)).toBe("A");

  const sections = columnSections();
  const sectionC = sections[2];
  const dropEvent = createDragEvent("drop", {
    dataTransfer: startEvent.dataTransfer,
  });
  act(() => {
    sectionC.dispatchEvent(dropEvent);
  });
  expect(headerC).toBeDefined();
  expect(onColumnReorder).toHaveBeenCalledWith({
    fromColumnName: "A",
    toColumnName: "C",
  });
});
