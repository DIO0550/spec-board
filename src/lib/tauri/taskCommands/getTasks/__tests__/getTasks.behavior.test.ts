import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";
import { type GetTasksPayload, getTasks } from "@/lib/tauri";
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

const emptyRawPayload = {
  tasks: [],
  projections: {},
  session: {
    projectKey: "/home/user/specs",
    generation: 1,
    revision: 1,
    eventSeq: 0,
  },
};

beforeEach(() => {
  vi.mocked(invoke).mockReset();
});

test("invoke が 'get_tasks' という command 名で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(emptyRawPayload);
  await getTasks();
  expect(vi.mocked(invoke).mock.calls[0]?.[0]).toBe("get_tasks");
});

test("invoke の第 2 引数（payload）は undefined で呼ばれる", async () => {
  vi.mocked(invoke).mockResolvedValue(emptyRawPayload);
  await getTasks();
  expect(vi.mocked(invoke).mock.calls[0]?.[1]).toBeUndefined();
});

test("成功時は tasks と projections を持つ payload を返す", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [taskPayloadFixture],
    projections: {
      "tasks/x.md": {
        subIssueProgress: { done: 1, total: 2 },
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

  const res = await getTasks();

  expect(res.ok).toBe(true);
  const { value } = res as { ok: true; value: GetTasksPayload };
  expect(value.tasks).toEqual([taskFixture]);
  expect(value.projections.get("tasks/x.md")?.subIssueProgress).toEqual({
    done: 1,
    total: 2,
  });
});

test("projections は Map に変換される", async () => {
  vi.mocked(invoke).mockResolvedValue({
    tasks: [],
    projections: {
      "tasks/x.md": {
        subIssueProgress: { done: 0, total: 0 },
        isDone: false,
        childFilePaths: [],
      },
    },
    session: {
      projectKey: "/home/user/specs",
      generation: 1,
      revision: 1,
      eventSeq: 0,
    },
  });

  const res = await getTasks();

  expect(res.ok).toBe(true);
  const { value } = res as { ok: true; value: GetTasksPayload };
  expect(value.projections).toBeInstanceOf(Map);
});

test("tasks / projections が空でも成功する", async () => {
  vi.mocked(invoke).mockResolvedValue(emptyRawPayload);

  const res = await getTasks();

  expect(res).toEqual({
    ok: true,
    value: {
      tasks: [],
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
  await expect(getTasks()).resolves.toMatchObject({ ok: false });
});

test("reject 時の error は TauriError インスタンス", async () => {
  vi.mocked(invoke).mockRejectedValue(new Error("fail"));
  const res = await getTasks();
  expect(res.ok).toBe(false);
  expect((res as { ok: false; error: unknown }).error).toBeInstanceOf(
    TauriError,
  );
});

test("session の 4 フィールドが domain 型として透過する", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    tasks: [],
    projections: {},
    session: {
      projectKey: "/home/user/specs",
      generation: 3,
      revision: 42,
      eventSeq: 17,
    },
  });

  const result = await getTasks();

  expect(Result.isOk(result) && result.value.session).toEqual({
    projectKey: "/home/user/specs",
    generation: 3,
    revision: 42,
    eventSeq: 17,
  });
});

test("session の値が 0 でも欠落しない", async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    tasks: [],
    projections: {},
    session: {
      projectKey: "",
      generation: 0,
      revision: 0,
      eventSeq: 0,
    },
  });

  const result = await getTasks();

  expect(Result.isOk(result) && result.value.session).toEqual({
    projectKey: "",
    generation: 0,
    revision: 0,
    eventSeq: 0,
  });
});
