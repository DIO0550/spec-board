import { act, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import type { Column as ColumnType } from "@/types/column";
import { Task, type TaskPayload } from "@/types/task";
import { AddColumnButton } from "../../AddColumnButton";
import { BoardProviders } from "../../BoardProviders";
import { Column } from "../../Column";
import { Board } from "..";

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

function createTask(overrides: Partial<TaskPayload> = {}): Task {
  return Task.fromPayload({
    id: "task-1",
    title: "テストタスク",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });
}

type RenderOptions = {
  /** Board.Column の元になるカラム定義 */
  columns: readonly ColumnType[];
  /** 「+ 追加」クリック時のコールバック（省略時は no-op） */
  onAddTask?: (columnName: string) => void;
  /** タスクカードクリック時のコールバック */
  onTaskClick?: (taskId: string) => void;
  /** 指定時のみ Board.AddColumn を末尾に置く */
  onAddColumn?: (columnName: string) => void;
  /** カラム名リネーム時のコールバック */
  onRenameColumn?: (oldName: string, newName: string) => void;
  /** カラム削除時のコールバック */
  onDeleteColumn?: (columnName: string, destColumn: string | undefined) => void;
  /** Provider にも届ける表示用タスク（省略時は空配列） */
  tasks?: readonly Task[];
  /** Provider にも届ける全タスク（省略時は tasks を流用） */
  allTasks?: readonly Task[];
};

/**
 * BoardProviders で 1 段ラップしたうえで、フラットな options を Board.Column / Board.AddColumn に
 * 組み替えて Board を mount するローカルヘルパー。
 * @param options - render に使う props 群
 */
const renderWithProviders = (options: RenderOptions) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const tasks = options.tasks ?? [];
  const allTasks = options.allTasks ?? tasks;
  const ordered = [...options.columns].sort((a, b) => a.order - b.order);
  const onAddTask = options.onAddTask ?? (() => {});
  const { onTaskClick, onAddColumn, onRenameColumn, onDeleteColumn } = options;
  act(() => {
    root?.render(
      <BoardProviders
        projections={TaskProjection.emptyMap}
        columns={options.columns}
        tasks={tasks}
        allTasks={allTasks}
      >
        <Board>
          {ordered.map((col, index) => (
            <Board.Column
              key={col.name}
              name={col.name}
              color={col.color}
              order={index}
              onAddTask={onAddTask}
              onTaskClick={onTaskClick}
              onRenameColumn={onRenameColumn}
              onDeleteColumn={onDeleteColumn}
            />
          ))}
          {onAddColumn && <Board.AddColumn onAdd={onAddColumn} />}
        </Board>
      </BoardProviders>,
    );
  });
};

const defaultColumns: ColumnType[] = [
  { name: "Todo", order: 0 },
  { name: "In Progress", order: 1 },
  { name: "Done", order: 2 },
];

test("columns に応じたカラムが表示される", async () => {
  renderWithProviders({ columns: defaultColumns });
  await vi.waitFor(() => {
    const sections = container?.querySelectorAll("section") ?? [];
    expect(sections.length).toBe(3);
    const labels = Array.from(sections).map((s) =>
      s.getAttribute("aria-label"),
    );
    expect(labels).toContain("Todo");
    expect(labels).toContain("In Progress");
    expect(labels).toContain("Done");
  });
});

test("各カラムヘッダーにステータス名とタスク件数が表示される", async () => {
  const tasks = [
    createTask({ id: "task-1", title: "タスク1", status: "Todo" }),
    createTask({ id: "task-2", title: "タスク2", status: "Todo" }),
    createTask({ id: "task-3", title: "タスク3", status: "In Progress" }),
  ];
  renderWithProviders({ columns: defaultColumns, tasks });
  await vi.waitFor(() => {
    const todoSection = container?.querySelector('section[aria-label="Todo"]');
    expect(todoSection?.textContent).toContain("Todo");
    expect(todoSection?.textContent).toContain("2");

    const inProgressSection = container?.querySelector(
      'section[aria-label="In Progress"]',
    );
    expect(inProgressSection?.textContent).toContain("In Progress");
    expect(inProgressSection?.textContent).toContain("1");

    const doneSection = container?.querySelector('section[aria-label="Done"]');
    expect(doneSection?.textContent).toContain("Done");
    expect(doneSection?.textContent).toContain("0");
  });
});

test("「+ 追加」ボタンが各カラムに表示される", async () => {
  renderWithProviders({ columns: defaultColumns });
  await vi.waitFor(() => {
    const buttons = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).filter((b) => b.textContent === "+ 追加");
    expect(buttons.length).toBe(3);
  });
});

test("カラムが 10 個以上ある場合でも表示される", async () => {
  const manyColumns: ColumnType[] = Array.from({ length: 12 }, (_, i) => ({
    name: `Status-${i}`,
    order: i,
  }));
  renderWithProviders({ columns: manyColumns });
  await vi.waitFor(() => {
    const sections = container?.querySelectorAll("section") ?? [];
    expect(sections.length).toBe(12);
  });
});

test("カラムが order 順に表示される", async () => {
  const unorderedColumns: ColumnType[] = [
    { name: "Done", order: 2 },
    { name: "Todo", order: 0 },
    { name: "In Progress", order: 1 },
  ];
  renderWithProviders({ columns: unorderedColumns });
  await vi.waitFor(() => {
    const sections = container?.querySelectorAll("section") ?? [];
    const labels = Array.from(sections).map((s) =>
      s.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Todo", "In Progress", "Done"]);
  });
});

test("onAddColumn 未指定の場合はカラム追加ボタンが表示されない", async () => {
  renderWithProviders({ columns: defaultColumns });
  await vi.waitFor(() => {
    const button = container?.querySelector(
      '[data-testid="add-column-button"]',
    );
    expect(button).toBeFalsy();
  });
});

test("onAddColumn 指定時はボード右端にカラム追加ボタンが表示される", async () => {
  renderWithProviders({
    columns: defaultColumns,
    onAddColumn: vi.fn(),
  });
  await vi.waitFor(() => {
    const button = container?.querySelector(
      '[data-testid="add-column-button"]',
    );
    expect(button).toBeTruthy();
  });
  // ルート直下はカラム行（+ 任意でフィルタツールバー）。カラム行は末尾要素。
  const columnsRow = container?.firstElementChild?.lastElementChild;
  const boardChildren = Array.from(columnsRow?.children ?? []);
  const lastChild = boardChildren[boardChildren.length - 1];
  expect(lastChild?.getAttribute("data-testid")).toBe("add-column-button");
});

test("カラム追加ボタンから Enter で onAddColumn が呼ばれる", async () => {
  const onAddColumn = vi.fn();
  renderWithProviders({
    columns: defaultColumns,
    onAddColumn,
  });
  let button: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    button = container?.querySelector(
      '[data-testid="add-column-button"]',
    ) as HTMLButtonElement | null;
    expect(button).toBeTruthy();
  });
  act(() => {
    button?.click();
  });
  const input = container?.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, "Review");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onAddColumn).toHaveBeenCalledWith("Review");
});

test("既存カラム名と同じ名前は onAddColumn に渡されない", async () => {
  const onAddColumn = vi.fn();
  renderWithProviders({
    columns: defaultColumns,
    onAddColumn,
  });
  let button: HTMLButtonElement | null = null;
  await vi.waitFor(() => {
    button = container?.querySelector(
      '[data-testid="add-column-button"]',
    ) as HTMLButtonElement | null;
    expect(button).toBeTruthy();
  });
  act(() => {
    button?.click();
  });
  const input = container?.querySelector(
    '[data-testid="add-column-input"]',
  ) as HTMLInputElement;
  act(() => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    nativeInputValueSetter?.call(input, "Todo");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(onAddColumn).not.toHaveBeenCalled();
});

// マイルストーン絞り込みは Board から TaskFilterBar / BoardWorkspace へ移管した。
// 絞り込みの振る舞いは applyTaskFilter のユニットテストで担保する。

test("color 未指定カラムは非連番 order でも表示順インデックスでフォールバック色を得る", () => {
  // order が非連番（10, 20）でも、フォールバック色は config の生 order 値ではなく
  // 表示順インデックス（0, 1）で決定的に割り当てられる。
  const columns: ColumnType[] = [
    { name: "First", order: 10 },
    { name: "Second", order: 20 },
  ];
  renderWithProviders({ columns });
  const hdrs = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-testid='column-header']") ??
      [],
  );
  expect(hdrs[0]?.getAttribute("style")).toContain(
    "var(--color-column-accent-1)",
  );
  expect(hdrs[1]?.getAttribute("style")).toContain(
    "var(--color-column-accent-2)",
  );
});

test("Board.Column が 0 件のとき空ボード（カラム / 追加ボタン共に無し）を描画する", async () => {
  renderWithProviders({ columns: [] });
  await vi.waitFor(() => {
    expect(
      container?.querySelectorAll("section[data-testid^='column-']").length,
    ).toBe(0);
  });
  // Board ルートは描画されており、内側コンテナの子は空（追加ボタンも無し）
  const boardRoot = container?.firstElementChild;
  const innerRow = boardRoot?.firstElementChild;
  expect(innerRow).not.toBeNull();
  expect(innerRow?.childElementCount).toBe(0);
  expect(
    container?.querySelector("[data-testid='add-column-button']"),
  ).toBeNull();
});

test("任意 ReactNode の children を素通しで描画する（型制約なし）", async () => {
  const showHidden = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <BoardProviders
        projections={TaskProjection.emptyMap}
        columns={[
          { name: "Todo", order: 0 },
          { name: "Frag", order: 1 },
        ]}
        tasks={[]}
        allTasks={[]}
      >
        <Board>
          <div data-testid="pass-foo" />
          {null}
          <Fragment key="frag-wrap">
            <Board.Column name="Frag" order={1} onAddTask={() => {}} />
          </Fragment>
          {showHidden && (
            <Board.Column name="Hidden" order={0} onAddTask={() => {}} />
          )}
          <Board.Column name="Todo" order={0} onAddTask={() => {}} />
        </Board>
      </BoardProviders>,
    );
  });
  await vi.waitFor(() => {
    expect(container?.querySelector("[data-testid='pass-foo']")).not.toBeNull();
  });
  // Fragment 越しの Board.Column と直書きの Board.Column 双方が描画される（>=2）
  expect(
    container?.querySelectorAll("section[data-testid^='column-']").length,
  ).toBeGreaterThanOrEqual(2);
});

test("compound 名前空間に既存 Column / AddColumnButton と同一参照を露出する", () => {
  expect(Board.Column).toBe(Column);
  expect(Board.AddColumn).toBe(AddColumnButton);
});
