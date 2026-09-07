import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import { taskFilePathFixture } from "@/domains/__tests__/taskFixtures";
import { Task, type TaskPayload } from "@/types/task";
import { TaskSelect } from "..";

type TaskSelectTestProps = Parameters<typeof TaskSelect>[0];

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

const makeTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "t-1",
    title: "候補",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: taskFilePathFixture("tasks/candidate.md"),
    ...overrides,
  });

const PATH_A = taskFilePathFixture("tasks/a.md");
const PATH_B = taskFilePathFixture("tasks/b.md");
const PATH_C = taskFilePathFixture("tasks/c.md");

const TASK_A = makeTask({ id: "t-1", title: "ログイン修正", filePath: PATH_A });
const TASK_B = makeTask({ id: "t-2", title: "検索機能追加", filePath: PATH_B });
const TASK_C = makeTask({ id: "t-3", title: "デプロイ手順", filePath: PATH_C });
const TASKS: Task[] = [TASK_A, TASK_B, TASK_C];

const render = (props: TaskSelectTestProps) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskSelect, props));
  });
};

// 同じ root へ再 render する（親の再レンダー相当）。container / root は作り直さない。
// props は毎回新しいオブジェクトで渡す。同一参照のまま渡すと React が
// bailout して関数コンポーネント自体が呼ばれず、useMemo の hit / miss を観測できない。
const rerender = (props: TaskSelectTestProps) => {
  act(() => {
    root?.render(createElement(TaskSelect, props));
  });
};

// tasks.filter の呼び出し回数を数える。candidates の useMemo は tasks.filter を呼ぶため、
// 「呼び出し回数が増えない = useMemo がキャッシュヒットした」の直接証拠になる。
const withFilterSpy = (tasks: Task[]) => {
  const spy = vi.fn(tasks.filter.bind(tasks));
  Object.defineProperty(tasks, "filter", { value: spy, configurable: true });
  return { tasks, spy };
};

// 親の keydown ハンドラ。TaskSelect が capture + stopPropagation で握ったら呼ばれない。
const withParentKeyDown = () => {
  const parentKeyDown = vi.fn();
  document.addEventListener("keydown", parentKeyDown);
  return {
    parentKeyDown,
    dispose: () => document.removeEventListener("keydown", parentKeyDown),
  };
};

const optionOf = (taskId: string) =>
  document.querySelector(`[data-testid="task-select-option-${taskId}"]`);

const inputEl = () =>
  document.querySelector(
    '[data-testid="task-select-input"]',
  ) as HTMLInputElement;

const setInputValue = (el: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const focusInput = () => {
  act(() => {
    inputEl().dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
};

const blurInput = () => {
  act(() => {
    inputEl().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
};

// keydown は container（= document の子孫）へ dispatch する。document を直接 target に
// すると capture / bubble の両リスナが AT_TARGET で並んで呼ばれ、stopPropagation では
// 親ハンドラを止められず「捕捉されたか」を判定できないため。
const pressKeyInside = (key: string) => {
  act(() => {
    container?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
};

const mouseDownOutside = () => {
  act(() => {
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
};

test("excludeFilePaths 省略時、同じ tasks / query での再レンダーでは候補を再計算しない", () => {
  const { tasks, spy } = withFilterSpy([...TASKS]);
  const props: TaskSelectTestProps = { tasks, value: null, onChange: vi.fn() };
  render(props);
  const callsAfterFirstRender = spy.mock.calls.length;

  rerender({ ...props });

  expect(spy.mock.calls.length).toBe(callsAfterFirstRender);
});

test("tasks が変わった再レンダーでは候補を再計算する", () => {
  const props: TaskSelectTestProps = {
    tasks: [TASK_A],
    value: null,
    onChange: vi.fn(),
    autoFocus: true,
  };
  render(props);
  expect(optionOf("t-2")).toBeNull();

  rerender({ ...props, tasks: [TASK_A, TASK_B] });

  expect(optionOf("t-2")).toBeTruthy();
});

test("query が変わると候補が絞り込まれる", () => {
  render({ tasks: TASKS, value: null, onChange: vi.fn(), autoFocus: true });

  act(() => {
    setInputValue(inputEl(), "検索");
  });

  expect(optionOf("t-2")).toBeTruthy();
  expect(optionOf("t-1")).toBeNull();
  expect(optionOf("t-3")).toBeNull();
});

test("excludeFilePaths を明示指定すると該当タスクが候補から除外される", () => {
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    excludeFilePaths: [PATH_B],
    autoFocus: true,
  });

  expect(optionOf("t-1")).toBeTruthy();
  expect(optionOf("t-2")).toBeNull();
  expect(optionOf("t-3")).toBeTruthy();
});

test("excludeFilePaths に空配列を明示しても除外は起きない", () => {
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    excludeFilePaths: [],
    autoFocus: true,
  });

  expect(optionOf("t-1")).toBeTruthy();
  expect(optionOf("t-2")).toBeTruthy();
  expect(optionOf("t-3")).toBeTruthy();
});

test("excludeFilePaths を差し替えると候補が再計算される", () => {
  const props: TaskSelectTestProps = {
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    excludeFilePaths: [],
    autoFocus: true,
  };
  render(props);
  expect(optionOf("t-2")).toBeTruthy();

  rerender({ ...props, excludeFilePaths: [PATH_B] });

  expect(optionOf("t-2")).toBeNull();
});

test("候補リストが開いている間の Escape は onClose を呼び親へ伝播しない", () => {
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  pressKeyInside("Escape");

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(parentKeyDown).not.toHaveBeenCalled();
  dispose();
});

test("候補リストが閉じている間の Escape は onClose を呼ばず親へ伝播する", () => {
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({ tasks: TASKS, value: null, onChange: vi.fn(), onClose });

  pressKeyInside("Escape");

  expect(onClose).not.toHaveBeenCalled();
  expect(parentKeyDown).toHaveBeenCalledTimes(1);
  dispose();
});

test("候補リストが開→閉に変わると Escape が親へ届くようになる", () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  blurInput();
  act(() => {
    vi.advanceTimersByTime(100);
  });
  pressKeyInside("Escape");

  expect(onClose).not.toHaveBeenCalled();
  expect(parentKeyDown).toHaveBeenCalledTimes(1);
  dispose();
});

test("候補リストが閉→開に変わると Escape が再び捕捉される", () => {
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({ tasks: TASKS, value: null, onChange: vi.fn(), onClose });

  focusInput();
  pressKeyInside("Escape");

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(parentKeyDown).not.toHaveBeenCalled();
  dispose();
});

test("onClose 未指定なら候補リストが開いていても Escape を捕捉しない", () => {
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({ tasks: TASKS, value: null, onChange: vi.fn(), autoFocus: true });

  pressKeyInside("Escape");

  expect(parentKeyDown).toHaveBeenCalledTimes(1);
  dispose();
});

test("候補リストが閉じていても外側 mousedown では onClose が呼ばれる", () => {
  const onClose = vi.fn();
  render({ tasks: TASKS, value: null, onChange: vi.fn(), onClose });

  mouseDownOutside();

  expect(onClose).toHaveBeenCalledTimes(1);
});

test("onClose 未指定なら外側 mousedown でも候補リストは閉じず onChange も呼ばれない", () => {
  const onChange = vi.fn();
  render({ tasks: TASKS, value: null, onChange, autoFocus: true });

  mouseDownOutside();

  expect(onChange).not.toHaveBeenCalled();
  expect(
    document.querySelector('[data-testid="task-select-list"]'),
  ).toBeTruthy();
});

test("unmount 後は Escape が捕捉されず親へ届く", () => {
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  act(() => {
    root?.unmount();
  });
  root = null;
  pressKeyInside("Escape");

  expect(onClose).not.toHaveBeenCalled();
  expect(parentKeyDown).toHaveBeenCalledTimes(1);
  dispose();
});

test.each([
  "Enter",
  "ArrowDown",
])("候補リストが開いていても %s は握り潰さない", (key) => {
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  pressKeyInside(key);

  expect(onClose).not.toHaveBeenCalled();
  expect(parentKeyDown).toHaveBeenCalledTimes(1);
  dispose();
});

test("blur 直後に再 focus すると Escape リスナが維持される", () => {
  vi.useFakeTimers();
  const onClose = vi.fn();
  const { parentKeyDown, dispose } = withParentKeyDown();
  render({
    tasks: TASKS,
    value: null,
    onChange: vi.fn(),
    onClose,
    autoFocus: true,
  });

  blurInput();
  act(() => {
    vi.advanceTimersByTime(50);
  });
  focusInput();
  act(() => {
    vi.advanceTimersByTime(100);
  });
  pressKeyInside("Escape");

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(parentKeyDown).not.toHaveBeenCalled();
  dispose();
});
