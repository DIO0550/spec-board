import { expect, test } from "vitest";
import {
  awaitProjectCommands,
  enqueueProjectCommand,
  type ProjectCommandQueue,
} from "../concurrency";

const createQueue = (): ProjectCommandQueue => ({
  current: Promise.resolve(),
});

/** 外から解決できる Promise を作る。 */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test("awaitProjectCommands は enqueue 済みの command が完了してから解決する", async () => {
  const queue = createQueue();
  const gate = deferred<void>();
  const order: string[] = [];
  void enqueueProjectCommand(queue, async () => {
    await gate.promise;
    order.push("command");
  });

  const barrier = awaitProjectCommands(queue).then(() => {
    order.push("barrier");
  });
  gate.resolve();
  await barrier;

  expect(order).toEqual(["command", "barrier"]);
});

test("awaitProjectCommands は queue を占有せず後続 command を待たせない", async () => {
  const queue = createQueue();
  const barrierGate = deferred<void>();
  void awaitProjectCommands(queue).then(() => barrierGate.promise);

  const result = await enqueueProjectCommand(queue, async () => "done");

  expect(result).toBe("done");
});

test("awaitProjectCommands は queue 上の command が reject しても reject しない", async () => {
  const queue = createQueue();
  const failing = enqueueProjectCommand(queue, () =>
    Promise.reject(new Error("boom")),
  );
  failing.catch(() => undefined);

  await expect(awaitProjectCommands(queue)).resolves.toBeUndefined();
});
