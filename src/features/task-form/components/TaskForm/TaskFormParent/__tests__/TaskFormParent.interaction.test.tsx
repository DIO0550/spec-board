import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test, vi } from "vitest";
import type { Task } from "@/types/task";

const parentTaskSelectSpy = vi.fn();
vi.mock("../../../ParentTaskSelect", () => ({
  ParentTaskSelect: (props: unknown) => {
    parentTaskSelectSpy(props);
    return null;
  },
}));

// NOTE: ParentTaskSelect は上記で mock 済み。import は動的にする必要があるため遅延 import。
const { TaskFormParent } = await import("..");

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  parentTaskSelectSpy.mockClear();
});

const mockTasks: Task[] = [
  {
    id: "p-1",
    filePath: "tasks/p-1.md",
    title: "親1",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
  },
];

const render = (props: Parameters<typeof TaskFormParent>[0]) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(TaskFormParent, props));
  });
};

test("ParentTaskSelect が呼ばれる", () => {
  render({
    tasks: mockTasks,
    value: undefined,
    onChange: vi.fn(),
    disabled: false,
  });
  expect(parentTaskSelectSpy).toHaveBeenCalled();
});

test("受け取った props が ParentTaskSelect にそのまま渡る", () => {
  const onChange = vi.fn();
  render({
    tasks: mockTasks,
    value: "tasks/p-1.md",
    onChange,
    disabled: true,
  });
  const lastCall =
    parentTaskSelectSpy.mock.calls[parentTaskSelectSpy.mock.calls.length - 1];
  const passedProps = lastCall[0] as {
    tasks: Task[];
    value: string | undefined;
    onChange: (v: string | undefined) => void;
    disabled: boolean;
  };
  expect(passedProps.tasks).toBe(mockTasks);
  expect(passedProps.value).toBe("tasks/p-1.md");
  expect(passedProps.onChange).toBe(onChange);
  expect(passedProps.disabled).toBe(true);
});
