import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { openProject } from "@/lib/tauri";
import { TauriError } from "@/lib/tauri/tauriError";
import { Task, type TaskPayload } from "@/types/task";
import { Result } from "@/utils/result";

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
  extras: {},
  warnings: [],
};

const taskFixture = Task.fromPayload(taskPayloadFixture);

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'open_project' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [],
    columns: [],
    projections: {},
    session: {
      projectKey: "/home/user/specs",
      generation: 1,
      revision: 1,
      eventSeq: 0,
    },
  });
  await openProject({ path: "/abs" });
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("open_project");
});

test("引数オブジェクト { path } がそのまま invoke 第 2 引数に渡る", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [],
    columns: [],
    projections: {},
    session: {
      projectKey: "/home/user/specs",
      generation: 1,
      revision: 1,
      eventSeq: 0,
    },
  });
  await openProject({ path: "/abs" });
  expect(vi.mocked(invoke)).toHaveBeenCalledWith("open_project", {
    path: "/abs",
  });
});

test("成功時は Result.ok({ tasks, columns, projections }) を返す", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [taskPayloadFixture],
    columns: ["Todo", "Done"],
    projections: {
      "tasks/x.md": {
        subIssueProgress: { done: 1, total: 3 },
        isDone: false,
        childFilePaths: ["tasks/y.md"],
      },
    },
    session: {
      projectKey: "/home/user/specs",
      generation: 1,
      revision: 1,
      eventSeq: 0,
    },
  });
  const res = await openProject({ path: "/abs" });
  expect(res).toEqual({
    ok: true,
    value: {
      tasks: [taskFixture],
      columns: ["Todo", "Done"],
      projections: new Map([
        [
          "tasks/x.md",
          {
            subIssueProgress: { done: 1, total: 3 },
            isDone: false,
            childFilePaths: ["tasks/y.md"],
          },
        ],
      ]),
      session: {
        projectKey: "/home/user/specs",
        generation: 1,
        revision: 1,
        eventSeq: 0,
      },
    },
  });
});

test("projections が空オブジェクトでも成功する", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [],
    columns: ["Todo"],
    projections: {},
    session: {
      projectKey: "/home/user/specs",
      generation: 1,
      revision: 1,
      eventSeq: 0,
    },
  });

  const res = await openProject({ path: "/abs" });

  expect(res).toEqual({
    ok: true,
    value: {
      tasks: [],
      columns: ["Todo"],
      projections: new Map(),
      session: {
        projectKey: "/home/user/specs",
        generation: 1,
        revision: 1,
        eventSeq: 0,
      },
    },
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

test.each([
  ["projectKey", "projectKey", "/home/user/specs"],
  ["generation", "generation", 3],
  ["revision", "revision", 42],
  ["eventSeq", "eventSeq", 17],
])("session の %s が落ちずに載る", async (_label, key, expected) => {
  vi.mocked(invoke).mockResolvedValueOnce({
    tasks: [],
    columns: [],
    projections: {},
    session: {
      projectKey: "/home/user/specs",
      generation: 3,
      revision: 42,
      eventSeq: 17,
    },
  });

  const result = await openProject({ path: "/home/user/specs" });

  expect(
    Result.isOk(result) &&
      (result.value.session as unknown as Record<string, unknown>)[key],
  ).toBe(expected);
});

test("invoke が Err なら session 変換は走らず Result.err になる", async () => {
  vi.mocked(invoke).mockRejectedValueOnce("ディレクトリが見つかりません: /x");

  const result = await openProject({ path: "/x" });

  expect(Result.isOk(result)).toBe(false);
});
