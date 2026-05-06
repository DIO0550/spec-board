import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { openProject } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const taskPayloadFixture: TaskPayload = {
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

const taskFixture = Task.fromPayload(taskPayloadFixture);

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'open_project' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({ tasks: [], columns: [] });
  await openProject({ path: "/abs" });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("open_project");
});

test("引数オブジェクト { path } がそのまま invoke 第 2 引数に渡る", async () => {
  vi.mocked(invoke).mockResolvedValue({ tasks: [], columns: [] });
  await openProject({ path: "/abs" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("open_project", {
    path: "/abs",
  });
});

test("成功時は Result.ok({ tasks, columns }) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [taskPayloadFixture],
    columns: ["Todo", "Done"],
  });
  const res = await openProject({ path: "/abs" });
  expect(res).toEqual({
    ok: true,
    value: { tasks: [taskFixture], columns: ["Todo", "Done"] },
  });
});

test("invoke が reject すると throw せず Result.err を返す", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  await expect(openProject({ path: "/abs" })).resolves.toMatchObject({
    ok: false,
  });
});

test("reject 時の error は TauriError インスタンス", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await openProject({ path: "/abs" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});

test("「ディレクトリが見つかりません」reject は code === NOT_FOUND になる", async () => {
  vi.mocked(invoke).mockRejectedValue(
    new Error("ディレクトリが見つかりません: /x"),
  );
  const res = await openProject({ path: "/x" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: TauriError }).error.code).toBe(
    "NOT_FOUND",
  );
});

test("不明な reject は code === UNKNOWN になる", async () => {
  vi.mocked(invoke).mockRejectedValue(null);
  const res = await openProject({ path: "/x" });
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: TauriError }).error.code).toBe("UNKNOWN");
});
