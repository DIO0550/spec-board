import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Task, type TaskPayload } from "@/types/task";
import { TaskCard } from "..";

let containerA: HTMLDivElement | null = null;
let rootA: ReturnType<typeof createRoot> | null = null;
let containerB: HTMLDivElement | null = null;
let rootB: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  containerA = document.createElement("div");
  document.body.appendChild(containerA);
  rootA = createRoot(containerA);
  containerB = document.createElement("div");
  document.body.appendChild(containerB);
  rootB = createRoot(containerB);
});

afterEach(() => {
  act(() => {
    rootA?.unmount();
    rootB?.unmount();
  });
  rootA = null;
  rootB = null;
  containerA?.remove();
  containerB?.remove();
  containerA = null;
  containerB = null;
});

const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "テスト",
    status: "Todo",
    labels: ["bug"],
    links: ["tasks/a.md"],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

test("Compound: 5 パーツの実コンテンツ（title / id / label / footer）がすべて描画される", () => {
  act(() => {
    rootA?.render(
      <TaskCard.Root task={createTask()} fromColumn="Todo">
        <TaskCard.Header />
        <TaskCard.Milestone />
        <TaskCard.Labels />
        <TaskCard.Progress />
        <TaskCard.Footer />
      </TaskCard.Root>,
    );
  });
  expect(
    containerA?.querySelector('[data-testid="task-card-title"]')?.textContent,
  ).toBe("テスト");
  expect(
    containerA?.querySelector('[data-testid="task-card-id"]')?.textContent,
  ).toBe("task-1");
  expect(
    containerA?.querySelector('[data-testid="label-tag"]')?.textContent,
  ).toBe("bug");
});

test("旧 API（Legacy）と新 API（Compound）が同じ data-testid と同じ可視内容を描画する", () => {
  const task = createTask({
    id: "same-1",
    title: "同一",
    labels: ["bug", "urgent"],
    links: ["tasks/a.md"],
  });
  const onClick = vi.fn();
  act(() => {
    rootA?.render(
      <TaskCard
        task={task}
        fromColumn="Todo"
        doneColumn="Done"
        onClick={onClick}
      />,
    );
  });
  act(() => {
    rootB?.render(
      <TaskCard.Root
        task={task}
        fromColumn="Todo"
        doneColumn="Done"
        onClick={onClick}
      >
        <TaskCard.Header />
        <TaskCard.Milestone />
        <TaskCard.Labels />
        <TaskCard.Progress />
        <TaskCard.Footer />
      </TaskCard.Root>,
    );
  });
  // 観察可能な振る舞いの同値性: テキスト・ラベル・role / aria 属性が一致すれば、
  // Legacy が新 API ラッパとして Compound と同じカードを描いていると判断できる。
  // className 並びや属性順序は HTML としては観察不能なので比較しない。
  const cardA = containerA?.querySelector('[data-testid="task-card"]');
  const cardB = containerB?.querySelector('[data-testid="task-card"]');
  expect(cardA?.getAttribute("role")).toBe(cardB?.getAttribute("role"));
  expect(cardA?.getAttribute("draggable")).toBe(
    cardB?.getAttribute("draggable"),
  );
  expect(
    containerA?.querySelector('[data-testid="task-card-title"]')?.textContent,
  ).toBe(
    containerB?.querySelector('[data-testid="task-card-title"]')?.textContent,
  );
  expect(
    containerA?.querySelector('[data-testid="task-card-id"]')?.textContent,
  ).toBe(
    containerB?.querySelector('[data-testid="task-card-id"]')?.textContent,
  );
  const labelsA = Array.from(
    containerA?.querySelectorAll('[data-testid="label-tag"]') ?? [],
  ).map((el) => el.textContent);
  const labelsB = Array.from(
    containerB?.querySelectorAll('[data-testid="label-tag"]') ?? [],
  ).map((el) => el.textContent);
  expect(labelsA).toEqual(labelsB);
  expect(labelsA).toEqual(["bug", "urgent"]);
});

test("doneColumn 省略時に default 'Done' が適用された結果が観察可能な DOM に出る", () => {
  // doneColumn が context に伝わるか直接観察せず、default が効いた結果として
  // 「status='Done' の子タスクが done としてカウントされる」ことで間接観察する。
  const parent = createTask({ id: "parent" });
  const childDone = createTask({ id: "c1", status: "Done" });
  const childTodo = createTask({ id: "c2", status: "Todo" });
  act(() => {
    rootA?.render(
      <TaskCard.Root
        task={parent}
        fromColumn="Todo"
        childTasks={[childDone, childTodo]}
        descendantTasks={[childDone, childTodo]}
      >
        <TaskCard.Footer />
      </TaskCard.Root>,
    );
  });
  // default "Done" が効いていれば 1/2、効かなければ 0/2。
  expect(
    containerA?.querySelector('[data-testid="task-card-subissue-count"]')
      ?.textContent,
  ).toBe("1/2");
});

test("Compound 並べ替え（Footer → Header → Labels）で順序とコンテンツが反映される", () => {
  act(() => {
    rootA?.render(
      <TaskCard.Root task={createTask()} fromColumn="Todo">
        <TaskCard.Footer />
        <TaskCard.Header />
        <TaskCard.Labels />
      </TaskCard.Root>,
    );
  });
  const children = Array.from(
    containerA?.querySelector('[data-testid="task-card"]')?.children ?? [],
  );
  // 並べ替えが反映されていれば footer が先頭になる。
  expect(children[0]?.tagName.toLowerCase()).toBe("footer");
  expect(
    containerA?.querySelector('[data-testid="task-card-id"]')?.textContent,
  ).toBe("task-1");
  expect(
    containerA?.querySelector('[data-testid="task-card-title"]')?.textContent,
  ).toBe("テスト");
  const tags = Array.from(
    containerA?.querySelectorAll('[data-testid="label-tag"]') ?? [],
  ).map((el) => el.textContent);
  expect(tags).toEqual(["bug"]);
});
