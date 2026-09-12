import { act, type ReactNode, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TaskProjection } from "@/domains/task-projection";
import { Task, type TaskPayload } from "@/types/task";
import {
  type DetailApi,
  DetailProvider,
  useDetail,
} from "../../DetailProvider";
import {
  type DeleteFlowApi,
  DeleteFlowProvider,
  type DeleteFlowProviderProps,
  useDeleteFlowContext,
} from "..";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

/**
 * テスト用タスクを生成する
 * @param overrides - 上書きするフィールド
 * @returns テスト用タスク
 */
const createTask = (overrides: Partial<TaskPayload> = {}): Task =>
  Task.fromPayload({
    id: "task-1",
    title: "t",
    status: "Todo",
    labels: [],
    links: [],
    children: [],
    reverseLinks: [],
    body: "",
    filePath: "tasks/test.md",
    ...overrides,
  });

/**
 * useDeleteFlowContext の戻り値を観測する Probe。
 * @param props - 最新値を受け取るコールバック
 * @returns null
 */
const Probe = (props: { onResult: (api: DeleteFlowApi) => void }) => {
  const api = useDeleteFlowContext();
  useEffect(() => {
    props.onResult(api);
  });
  return null;
};

/**
 * DeleteFlowProvider 配下に Probe を mount し、latest API を観測する。
 * @param overrides 上書きしたい Provider props（children 以外）
 * @returns latest accessor
 */
const mountProbe = (
  overrides: Partial<Omit<DeleteFlowProviderProps, "children">> = {},
) => {
  let latest: DeleteFlowApi | null = null;
  const handleResult = (api: DeleteFlowApi) => {
    latest = api;
  };
  const build = (): ReactNode => (
    <StrictMode>
      <DeleteFlowProvider
        task={createTask()}
        onDelete={() => {}}
        {...overrides}
      >
        <Probe onResult={handleResult} />
      </DeleteFlowProvider>
    </StrictMode>
  );
  act(() => {
    root?.render(build());
  });
  return {
    get latest(): DeleteFlowApi {
      return latest as DeleteFlowApi;
    },
  };
};

test("初期状態は isOpen=false / isBusy=false / orphanStrategy='clear'", () => {
  const probe = mountProbe();
  expect(probe.latest.isOpen).toBe(false);
  expect(probe.latest.isBusy).toBe(false);
  expect(probe.latest.orphanStrategy).toBe("clear");
});

test("requestDelete で isOpen が true になり、cancelDelete で false に戻る", () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.requestDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  act(() => {
    probe.latest.cancelDelete();
  });
  expect(probe.latest.isOpen).toBe(false);
});

test("setOrphanStrategy('abort') が反映され、requestDelete で 'clear' に戻る", () => {
  const probe = mountProbe();
  act(() => {
    probe.latest.setOrphanStrategy("abort");
  });
  expect(probe.latest.orphanStrategy).toBe("abort");
  act(() => {
    probe.latest.requestDelete();
  });
  expect(probe.latest.orphanStrategy).toBe("clear");
});

test.each([
  { name: "子なし", children: [], expected: ["task-1"] },
  {
    name: "子あり（既定 clear）",
    children: ["a.md"],
    expected: ["task-1", "clear"],
  },
])("$name: confirmDelete で onDelete が $expected で呼ばれる", async ({
  children,
  expected,
}) => {
  const onDelete = vi.fn();
  const probe = mountProbe({ task: createTask({ children }), onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(onDelete.mock.calls[0]).toEqual(expected);
});

test("子あり: abort に切替後の confirmDelete で onDelete(id, 'abort')", async () => {
  const onDelete = vi.fn();
  const probe = mountProbe({
    task: createTask({ children: ["a.md"] }),
    onDelete,
  });
  act(() => {
    probe.latest.requestDelete();
  });
  act(() => {
    probe.latest.setOrphanStrategy("abort");
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(onDelete.mock.calls[0]).toEqual(["task-1", "abort"]);
});

test("onDelete が resolve すると isOpen が false に戻る", async () => {
  const probe = mountProbe({ onDelete: async () => {} });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(false);
});

test("onDelete が reject すると isOpen のまま isBusy が false に戻る", async () => {
  const probe = mountProbe({
    onDelete: async () => {
      throw new Error("boom");
    },
  });
  act(() => {
    probe.latest.requestDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(probe.latest.isOpen).toBe(true);
  expect(probe.latest.isBusy).toBe(false);
});

test("isBusy 中に confirmDelete を再度呼んでも onDelete は二重に呼ばれない", async () => {
  const onDelete = vi.fn(() => new Promise<void>(() => {}));
  const probe = mountProbe({ onDelete });
  act(() => {
    probe.latest.requestDelete();
  });
  act(() => {
    void probe.latest.confirmDelete();
  });
  await act(async () => {
    await probe.latest.confirmDelete();
  });
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(probe.latest.isBusy).toBe(true);
});

/**
 * useDetail() の consumer。レンダー回数を数え、api を外へ流す。
 * @param props - 観測コールバック
 * @returns null
 */
const DetailRenderProbe = (props: { onRender: (api: DetailApi) => void }) => {
  const api = useDetail();
  props.onRender(api);
  return null;
};

test("requestDelete による state 変更で DetailProvider の consumer が再レンダーしない", () => {
  const detailRenders: DetailApi[] = [];
  // コールバック内での代入は TS の制御フロー解析に乗らず `never` に狭まるため、
  // let ではなくオブジェクトの current に保持する。
  const deleteFlow: { current: DeleteFlowApi | null } = { current: null };
  act(() => {
    root?.render(
      <DetailProvider
        task={createTask()}
        columns={[]}
        projections={TaskProjection.emptyMap}
        onTaskUpdate={() => {}}
      >
        <DeleteFlowProvider task={createTask()} onDelete={() => {}}>
          <DetailRenderProbe onRender={(api) => detailRenders.push(api)} />
          <Probe
            onResult={(api) => {
              deleteFlow.current = api;
            }}
          />
        </DeleteFlowProvider>
      </DetailProvider>,
    );
  });
  const rendersBefore = detailRenders.length;
  act(() => {
    deleteFlow.current?.requestDelete();
  });
  expect(deleteFlow.current?.isOpen).toBe(true);
  expect(detailRenders.length).toBe(rendersBefore);
});

test("Provider の外で useDeleteFlowContext を呼ぶと throw する", () => {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => {
    act(() => {
      root?.render(<Probe onResult={() => {}} />);
    });
  }).toThrow(/DeleteFlowProvider/);
  consoleSpy.mockRestore();
});
