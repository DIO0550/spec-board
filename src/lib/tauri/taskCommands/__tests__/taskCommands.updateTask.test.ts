import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { updateTask } from "@/lib/tauri/taskCommands";
import { TauriError } from "@/lib/tauri/tauriError";
import type { Task } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const taskFixture: Task = {
  id: "1",
  title: "T",
  status: "Todo",
  labels: [],
  links: [],
  children: [],
  reverseLinks: [],
  body: "",
  filePath: "tasks/x.md",
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'update_task' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(taskFixture);
  await updateTask({ filePath: "tasks/x.md" });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("update_task");
});

test("filePath を含む引数が camelCase のまま渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(taskFixture);
  await updateTask({ filePath: "tasks/x.md", title: "new" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("update_task", {
    filePath: "tasks/x.md",
    title: "new",
  });
});

test("optional 未指定（キー省略）の場合、そのキーは invoke 引数に含まれない", async () => {
  vi.mocked(invoke).mockResolvedValue(taskFixture);
  await updateTask({ filePath: "tasks/x.md" });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect(Object.keys(args)).toEqual(["filePath"]);
});

test("optional に undefined を明示指定した場合 undefined のまま渡る（ラッパで削らない）", async () => {
  vi.mocked(invoke).mockResolvedValue(taskFixture);
  await updateTask({ filePath: "tasks/x.md", title: undefined });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect("title" in args).toBe(true);
  expect(args.title).toBeUndefined();
});

test("parent: '' （親解除）はそのまま空文字で渡る", async () => {
  vi.mocked(invoke).mockResolvedValue(taskFixture);
  await updateTask({ filePath: "tasks/x.md", parent: "" });
  const args = vi.mocked(invoke).mock.calls[0]?.[1] as Record<string, unknown>;
  expect(args.parent).toBe("");
});

test("成功時は Result.ok(Task) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue(taskFixture);
  const res = await updateTask({ filePath: "tasks/x.md", title: "new" });
  expect(res).toEqual({ ok: true, value: taskFixture });
});

test("invoke が reject すると throw せず Result.err(TauriError) を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await updateTask({ filePath: "tasks/x.md" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});
