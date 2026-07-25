import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { moveTask } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const taskPayloadFixture: TaskPayload = {
  id: "1",
  title: "T",
  status: "Done",
  labels: [],
  links: ["tasks/y.md"],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/x.md",
  extras: {},
  warnings: [],
};

const taskFixture = Task.fromPayload(taskPayloadFixture);

const params = {
  filePath: "tasks/x.md",
  fromColumn: "Todo",
  toColumn: "Done",
  toColumnFilePaths: ["tasks/x.md"],
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'move_task' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await moveTask(params);
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("move_task");
});

test("引数が args キー配下に camelCase のまま渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await moveTask(params);
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("move_task", {
    args: {
      filePath: "tasks/x.md",
      fromColumn: "Todo",
      toColumn: "Done",
      toColumnFilePaths: ["tasks/x.md"],
    },
  });
});

test("同一カラム並び替え（fromColumn === toColumn）も同じ command で渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  await moveTask({
    ...params,
    toColumn: "Todo",
    toColumnFilePaths: ["tasks/y.md", "tasks/x.md"],
  });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("move_task", {
    args: {
      filePath: "tasks/x.md",
      fromColumn: "Todo",
      toColumn: "Todo",
      toColumnFilePaths: ["tasks/y.md", "tasks/x.md"],
    },
  });
});

test("成功時は TaskPayload を Task へ変換した Result.ok を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(taskPayloadFixture);
  const res = await moveTask(params);
  expect(res).toEqual({ ok: true, value: taskFixture });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await moveTask(params);
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
